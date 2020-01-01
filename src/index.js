const dotenv = require('dotenv');
dotenv.config();

const bluebird = require('bluebird');
bluebird.config({ longStackTraces: true, warnings: { wForgottenReturn: false } });
global.Promise = bluebird;

const API = require('./API');
new API();