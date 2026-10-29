// Local Juice Shop container only. Force the upstream server's listen(3000, callback)
// to bind 127.0.0.1. The agent independently checks /proc/net/tcp before connecting.
const net = require('node:net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if ((args[0] === 3000 || args[0] === '3000') && (args.length === 1 || typeof args[1] === 'function')) {
    return listen.call(this, 3000, '127.0.0.1', ...args.slice(1));
  }
  return listen.apply(this, args);
};
