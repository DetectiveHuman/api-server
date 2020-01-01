const express = require('express');
const Route = require('../Structure/Route');
const Logger = require('../Util/Logger');

class NotFound extends Route {
	constructor(parent) {
		super({
			position: 2,
			route: '/'
		});

		Object.assign(this, parent);

		this.router = express.Router();
		this.setupRoutes();
	}

	setupRoutes() {
		this.router.use((req, res) => {
			res.status(404).json({ success: false, code: 404, message: 'API revision not found' });
		});

		this.router.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
			Logger.error(error);
			res.status(500).json({ success: false, code: 500, message: 'An internal server error occurred. Please try again later.' });
		});
	}
}

module.exports = NotFound;