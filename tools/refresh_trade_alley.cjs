'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const here = __dirname;
for (const script of ['build_wfc_market_model.cjs', 'build_trade_values.cjs']) {
  execFileSync(process.execPath, [path.join(here, script)], { stdio: 'inherit' });
}
