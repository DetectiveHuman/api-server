const path = require('path');
const express = require('express');
const Route = require('../Structure/Route');

class Static extends Route {
	constructor(parent) {
		super({
			position: 0,
			route: '/'
		});

		Object.assign(this, parent);

		this.router = express.Router();
		this.setupRoutes();
	}

	setupRoutes() {
		this.router.use(express.static(path.join(__dirname, '..', 'Static'), {
			setHeaders: (res) => {
				res.removeHeader('Cache-Control');
				res.set('Cache-Control', [
					'public',
					'max-age=86400'
				]);
			}
		}));
	}
}

module.exports = Static;