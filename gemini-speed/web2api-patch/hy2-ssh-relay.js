// TCP relay: local port -> socks5 (127.0.0.1:8320, via HY2) -> target host:port
const net = require("net");
const LPORT = parseInt(process.argv[2] || "9446");
const DST_HOST = process.argv[3] || "64.112.40.17";
const DST_PORT = parseInt(process.argv[4] || "22");

net.createServer((client) => {
  client.setNoDelay(true);
  const early = [];
  let established = false;
  let stage = 0;
  let rbuf = Buffer.alloc(0);
  const fail = () => { try { client.destroy(); up.destroy(); } catch (e) {} };
  const up = net.connect(8320, "127.0.0.1", () => {
    up.write(Buffer.from([5, 1, 0])); // hello: no-auth
  });
  up.setNoDelay(true);
  client.on("data", (b) => {
    if (established) up.write(b); else early.push(b);
  });
  up.on("data", (d) => {
    if (established) { client.write(d); return; }
    rbuf = Buffer.concat([rbuf, d]);
    if (stage === 0) {
      if (rbuf.length < 2) return;
      stage = 1;
      const req = Buffer.concat([
        Buffer.from([5, 1, 0, 3, DST_HOST.length]),
        Buffer.from(DST_HOST),
        Buffer.from([DST_PORT >> 8, DST_PORT & 255]),
      ]);
      up.write(req);
      rbuf = rbuf.slice(2);
    }
    if (stage === 1 && rbuf.length >= 4) {
      const atyp = rbuf[3];
      let need;
      if (atyp === 1) need = 10;
      else if (atyp === 3) { if (rbuf.length < 5) return; need = 5 + rbuf[4] + 2; }
      else if (atyp === 4) need = 22;
      else return fail();
      if (rbuf.length < need) return;
      if (rbuf[1] !== 0) { console.error("socks connect rejected: " + rbuf[1]); return fail(); }
      const leftover = rbuf.slice(need);
      established = true;
      if (leftover.length) client.write(leftover);
      for (const b of early) up.write(b);
    }
  });
  up.on("error", fail);
  client.on("error", fail);
  up.on("close", () => { try { client.destroy(); } catch (e) {} });
  client.on("close", () => { try { up.destroy(); } catch (e) {} });
}).listen(LPORT, "127.0.0.1", () => console.log("relay up: 127.0.0.1:" + LPORT + " -> socks5 -> " + DST_HOST + ":" + DST_PORT));
