const express = require('express');
const compression = require('compression');
const fs = require('fs').promises;
const path = require('path');
const Logger = require('./Util/Logger');
const Database = require('./Structure/Database');

require('express-async-errors');

class API {
	constructor() {
		this.routers = [];
		this.jobs = [];
		this.app = express();

		this.db = new Database(this);

		process.on('uncaughtException', (error) => {
			Logger.error(error);
		});

		process.on('exit', () => {
			this.db.close();

			process.kill(process.pid);
		});

		this.setup();
	}

	setup() {
		this.app.disable('x-powered-by');

		this.app.use(compression());

		this.app.use((req, res, next) => {
			res.set('Access-Control-Allow-Origin', '*');
			res.set('Access-Control-Allow-Methods', 'GET, POST');

			const body = [];

			req.on('data', (data) => {
				body.push(data);
			});

			req.on('end', () => {
				req.body = body.join('');

				next();
			});
		});

		process.on('uncaughtException', (error) => {
			Logger.error(error);
		});

		process.on('unhandledRejection', (error) => {
			Logger.error(error);
		});

		this.loadDatabase();
	}

	async loadDatabase() {
		await this.db.connect();

		Logger.info('Successfully connected to database.');

		this.loadRoutes(path.join(__dirname, 'Routes'));
	}

	async loadRoutes(directory) {
		const routes = await fs.readdir(directory);

		if (routes.length > 0) {
			for (let i = 0; i < routes.length; i++) {
				const Router = require(path.join(directory, routes[i]));
				const route = new Router(this);
				this.routers.push(route);

				if (i + 1 === routes.length) {
					this.routers.sort((a, b) => {
						if (a.position > b.position) return 1;
						if (b.position > a.position) return -1;
						return 0;
					});

					for (i = 0; i < this.routers.length; i++) {
						this.app.use(this.routers[i].route, this.routers[i].router);

						if (i + 1 === this.routers.length) {
							Logger.info('Loaded ' + routes.length + ' routes.');

							this.launch();
						}
					}
				}
			}
		} else {
			this.launch();
		}
	}

	launch() {
		this.app.listen(process.env.PORT || 3001, process.env.HOST || 'localhost', () => {
			Logger.info('Listening on port ' + (process.env.PORT || 3001) + '.');
		});
	}
}

module.exports = API;