#!/usr/bin/env node
var cmd = require('commander')
  , request = require('request')

cmd
  .usage('sitemon-agent [options] <url>')
  .version(require('./package.json').version)
  .option('--auth <user:pass>', 'basic auth if sitemon instance is protected')
  .description('start the sitemon agent')

cmd.parse(process.argv);

var exec = require('child_process').exec;

function getPayload (cb) {
  function bail (err, reason) {
    console.error(err, reason);
    cb(err);
  }

  var resp = {};

  exec('free -m', function (err, stdout, stderr) {
    if (err) return bail(err);
    var lines = String(stdout).split('\n');
    if (lines < 3) return bail(stdout + '\n---\n' + stderr, 'not enough lines for free -m');
    var memCols = lines[1].split(/\s+/);
    var swapCols = lines[3].split(/\s+/);
    resp.mem_total = Number(memCols[1]);
    resp.mem_used = Number(memCols[2]);
    resp.mem_free = Number(memCols[3]);
    resp.swap_total = Number(swapCols[1]);
    resp.swap_used = Number(swapCols[2]);
    resp.swap_free = Number(swapCols[3]);
    exec('cat /proc/loadavg', function (err, stdout, stderr) {
      if (err) return bail(err);
      var cols = stdout.split(' ');
      if (cols.length >= 4) {
        //resp.load_avg = Number(cols[0]);
        resp.load_avg = Number(cols[1]);
        //resp.load15 = Number(cols[2]);
        resp.running = Number(cols[3].split('/')[0]);
      }
      else return bail(stdout + '\n---\n' + stderr, 'not enough lines for cat /proc/loadavg');
      exec('df -h | tail -n +2 | awk \'{print $5}\' | head -n 1', function (err, stdout, stderr) {
        if (err) bail(err);
        resp.disk_pct = Number(stdout.replace('%\n', ''));
        exec('netstat --inet | tail -n +3 | wc -l', function (err, stdout, stderr) {
          resp.tcp_conns = Number(stdout);
          cb(null, resp);
        });
      });
    });
  });
}

var url = cmd.args[0];
if (!url) throw new Error('url is required param');

(function doPost () {
  getPayload(function (err, resp) {
    if (err) throw err;
    var headers = {};
    if (cmd.auth) headers['Authorization'] = 'Basic ' + Buffer(cmd.auth).toString('base64');
    request({
      uri: url + '/data',
      method: 'POST',
      headers: headers,
      json: resp
    }, function (err, resp, body) {
      if (err) throw err;
      if (resp.statusCode != 200) {
        console.error(new Date(), 'unknown status', resp.statusCode, body);
      }
      else console.log(new Date(), 'post ok');
      setTimeout(doPost, 60000 * 5);
    });
  });
})();
