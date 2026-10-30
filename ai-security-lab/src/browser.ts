import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { allowedRequest, assertNetworkIsolation, assertLoopbackListener, ORIGIN } from './scope.js';
import { sha256, validatePlan, type Observation, type UiElement, type Plan } from './model.js';
import { consumeApproval } from './approval.js';
import { readChallenge, evaluateTransition, type Evaluation } from './evaluator.js';

const RESOURCE_TYPES = new Set(['document','stylesheet','image','media','font','script','xhr','fetch','other']);
const CONTENT_TYPES = new Set(['text/html','application/json','text/css','application/javascript','text/javascript','image/png','image/jpeg','image/svg+xml','image/webp','font/woff2']);
const LABEL_LIMIT = 80;
export function assertActionDeadline(plan: Plan, approvalExpiresAt: string, now = Date.now()): void {
  validatePlan(plan, now);
  if (Date.parse(approvalExpiresAt) <= now) throw new Error('APPROVAL_EXPIRED');
}
function sanitizeLabel(value: string): string {
  return value.replace(/\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g,'[email]')
    .replace(/\b(?:bearer\s+)?[a-zA-Z0-9_-]{24,}\b/gi,'[redacted]')
    .replace(/[\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,LABEL_LIMIT);
}

export async function withDeadline<T>(work: () => Promise<T>, timeout: number, onTimeout: () => Promise<void>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { void onTimeout().catch(() => undefined); reject(new Error('DEADLINE_EXCEEDED')); }, timeout);
  });
  try { return await Promise.race([work(),timeoutPromise]); }
  finally { if (timer) clearTimeout(timer); }
}

export class GuardedBrowser {
  readonly #browser:Browser;
  readonly #context:BrowserContext;
  readonly #page:Page;
  private constructor(browser: Browser, context: BrowserContext, page: Page,
    readonly stats: {blocked: number; responses: Observation['responses']; requests: number}) {
    this.#browser=browser; this.#context=context; this.#page=page;
  }
  static async open(): Promise<GuardedBrowser> {
    assertNetworkIsolation(); assertLoopbackListener();
    const browser = await chromium.launch({headless:true, args:['--disable-background-networking','--disable-quic','--disable-sync','--disable-domain-reliability','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
    try {
      const context = await browser.newContext({serviceWorkers:'block',acceptDownloads:false, viewport:{width:1280,height:720}});
      const stats: {blocked:number; responses:Observation['responses']; requests:number} = {blocked:0,responses:[],requests:0};
      // Installed before the first page is created; also applies to popups and frames.
      await context.route('**/*', async route => {
        const req = route.request(); stats.requests++;
        if (stats.requests > 150 || !allowedRequest(req.url(),req.method(),req.redirectedFrom() !== null)) {
          stats.blocked++; await route.abort('blockedbyclient'); return;
        }
        // route.continue() does NOT re-invoke the handler for redirected requests.
        // Fetch exactly one hop; never pass a 3xx back to the browser.
        try {
          const response=await route.fetch({maxRedirects:0,timeout:4000});
          if(response.status() >= 300 && response.status() < 400){stats.blocked++;await route.abort('blockedbyclient');return;}
          await route.fulfill({response});
        } catch {stats.blocked++;await route.abort('failed').catch(()=>undefined);}
      });
      // Never connect a WebSocket to a server. Service workers are disabled above.
      await context.routeWebSocket('**/*', ws => { ws.close(); stats.blocked++; });
      context.on('response', (response: Response) => {
        if (stats.responses.length >= 150) return;
        const mime=(response.headers()['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
        const resource=response.request().resourceType();
        stats.responses.push({status:response.status(),type:CONTENT_TYPES.has(mime)?mime:'other',resource:RESOURCE_TYPES.has(resource)?resource:'other'});
      });
      const page = await context.newPage();
      page.setDefaultTimeout(4000); page.setDefaultNavigationTimeout(8000);
      // Extra windows are never used by the agent.
      context.on('page', extra => { if (extra !== page) void extra.close().catch(() => undefined); });
      return new GuardedBrowser(browser,context,page,stats);
    } catch (error) { await browser.close(); throw error; }
  }
  async close(): Promise<void> { await this.#context.close().catch(()=>undefined); await this.#browser.close().catch(()=>undefined); }
  async load(): Promise<void> {
    const response = await this.#page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded',timeout:8000});
    if (!response || response.status() < 200 || response.status() >= 300 || !allowedRequest(response.url(),'GET',false)) throw new Error('INITIAL_PAGE_UNAVAILABLE');
  }
  async inspect(dir: string): Promise<Observation> {
    return withDeadline(async () => {
      await this.load();
      await this.#page.locator('button,[role="button"]').first().waitFor({state:'visible',timeout:5000}).catch(()=>undefined);
      const ui: UiElement[] = [];
      for (const role of ['button','link','textbox'] as const) {
        const matches = this.#page.getByRole(role); const count = Math.min(await matches.count(), 25);
        for (let i=0;i<count && ui.length<50;i++) {
          const el=matches.nth(i);
          if (!(await el.isVisible())) continue;
          const name = sanitizeLabel(await el.evaluate(node => node.getAttribute('aria-label') || node.getAttribute('title') || (node instanceof HTMLInputElement ? '' : node.textContent || '')));
          ui.push({role,name});
        }
      }
      await mkdir(dir,{recursive:true,mode:0o700});
      const file=join(dir,'screenshot.png'); await this.#page.screenshot({path:file,animations:'disabled',timeout:4000});
      return {schema:'ai-security-lab-observation/v1',observedAt:new Date().toISOString(),target:ORIGIN,ui,responses:this.stats.responses.map(x=>({...x})),blockedRequests:this.stats.blocked,screenshotSha256:sha256(await readFile(file))};
    },15000,()=>this.close());
  }
  static async executeApproved(plan:Plan, approvalsDir:string):Promise<{execution:'completed'|'failed';evaluation:Evaluation;approvalGrantedAt:string}> {
    assertNetworkIsolation(); assertLoopbackListener();
    const approval=await consumeApproval(plan, approvalsDir);
    const id=plan.objective.kind==='juice_challenge'?plan.objective.id:null;
    let before:boolean|null=null,after:boolean|null=null,execution:'completed'|'failed'='failed';
    let browser:GuardedBrowser|undefined;
    try {
      if(id!==null)before=await readChallenge(id);
      browser=await GuardedBrowser.open();
      await browser.#click(plan, approval.expiresAt); execution='completed';
      if(id!==null)after=await readChallenge(id);
    } catch { execution='failed'; }
    finally { await browser?.close(); }
    return {execution,evaluation:execution==='completed'?evaluateTransition(id,before,after):evaluateTransition(id,before,null),approvalGrantedAt:approval.grantedAt};
  }
  async #click(plan: Plan, approvalExpiresAt: string): Promise<void> {
    return withDeadline(async () => {
      await this.load();
      await this.#page.locator('button,[role="button"]').first().waitFor({state:'visible',timeout:5000}).catch(()=>undefined);
      const button=this.#page.getByRole('button',{name:plan.action.name,exact:true});
      if ((await button.count()) !== 1 || !(await button.isVisible())) throw new Error('BUTTON_NOT_UNIQUE_OR_VISIBLE');
      assertActionDeadline(plan, approvalExpiresAt);
      await button.click({timeout:4000,noWaitAfter:true});
      await this.#page.waitForTimeout(500);
    },15000,()=>this.close());
  }
}
