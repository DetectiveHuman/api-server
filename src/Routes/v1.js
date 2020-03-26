const express = require('express');
const snekfetch = require('snekfetch');
const rateLimit = require('express-rate-limit');
const Route = require('../Structure/Route');
const Logger = require('../Util/Logger');
const config = require('../config');

class v1 extends Route {
	constructor(parent) {
		super({
			position: 1,
			route: '/v1'
		});

		Object.assign(this, parent);

		this.botAllowedFields = ['id', 'username', 'discriminator', 'avatar', 'approved', 'avatar_child_friendly', 'certified', 'short_description', 'full_description', 'library', 'links', 'prefix', 'tags', 'shards', 'server_count', 'owners', 'vanity', 'created_at', 'updated_at'];
		this.userAllowedFields = ['id', 'username', 'discriminator', 'avatar', 'short_description'];

		this.rateLimitKey = (req) => req.get('Authorization') || req.ip;
		this.rateLimitHandle = (req, res) => res.status(429).json({ success: false, code: 429, message: 'You are sending too many requests, please slow down' });
		this.rateLimitSkip = (req) => config.whitelisted.includes(req.ip) || config.whitelisted.includes(req.get('Authorization') || '');

		this.router = express.Router();
		this.setupRoutes();
	}

	setupRoutes() {
		this.router.get('/statistics', this.rateLimit(1000, 5), async (req, res) => {
			const approvedBots = await this.db.getAllBotsApprovedCount();
			const bots = await this.db.getAllBotsCount();
			const users = await this.db.getAllUsersCount();
			const tags = await this.db.getAllTagsCount();

			res.json({
				success: true,
				total_bots: bots,
				approved_bots: approvedBots,
				unapproved_bots: bots - approvedBots,
				tags,
				users
			});
		});

		this.router.get('/bots', this.rateLimit(1000 * 60, 25), async (req, res) => {
			const bots = await this.db.getAllBotsWithFields(this.botAllowedFields, this.userAllowedFields);

			res.json(bots);

		});

		this.router.get('/bots/:id', this.rateLimit(1000, 2), this.getBot(), async (req, res) => {
			const bot = await this.db.getBotWithFields(res.locals.bot.id, this.botAllowedFields, this.userAllowedFields);

			res.json({
				success: true,
				...bot
			});
		});

		this.router.post('/bots/:id', this.rateLimit(1000 * 15, 15), this.getBot(), this.checkBotAuth(), async (req, res) => {
			if (!req.get('Content-Type').includes('application/json')) return res.status(400).json({ success: false, code: 400, message: 'The Content-Type header must be set to application/json' });

			try {
				req.body = JSON.parse(req.body);

				if (!req.body || typeof req.body !== 'object') return res.status(400).json({ code: 400, message: 'JSON body data is invalid or corrupted' });

				const bot = res.locals.bot;

				if (!('server_count' in req.body) && !('shards' in req.body)) return res.status(400).json({ code: 400, message: 'Missing server_count or shards property from body' });

				if ('server_count' in req.body) {
					if (req.body.server_count !== null) {
						if (typeof req.body.server_count !== 'number') return res.status(400).json({ code: 400, message: 'Property server_count must be a valid number' });
						if (req.body.server_count < 1) return res.status(400).json({ code: 400, message: 'Property server_count is too small' });
						if (req.body.server_count > 10000000) return res.status(400).json({ code: 400, message: 'Property server_count is too big' });
					}

					await this.db.updateBot(bot.id, { server_count: req.body.server_count });

					res.json({ code: 200, message: 'Successfully updated server count' });
				} else {
					let shards = null;

					if (req.body.shards instanceof Array) {
						shards = req.body.shards;

						if (shards.filter((shard) => typeof shard !== 'number').length > 0) return res.status(400).json({ code: 400, message: 'One of the shards has an invalid value' });
						if (shards.filter((shard) => shard < 1).length > 0) return res.status(400).json({ code: 400, message: 'One of the shards has too small of a count' });
						if (shards.filter((shard) => shard > 3000).length > 0) return res.status(400).json({ code: 400, message: 'One of the shards has too big of a count' });
					} else if (req.body.shards !== null) {
						return res.status(400).json({ code: 400, message: 'Property shards must be an array or null' });
					}

					await this.db.updateBot(bot.id, { shards, server_count: req.body.shards.reduce((a, b) => a + b, 0) });

					res.json({ code: 200, message: 'Successfully updated server count' });
				}
			} catch (error) {
				if (/^Unexpected token/.test(error.message) || /^Unexpected end of JSON input$/.test(error.message)) {
					res.status(400).json({ success: false, code: 400, message: 'JSON body data is invalid or corrupted' });
				} else {
					res.status(500).json({ success: false, code: 500, message: 'An internal server error occurred. Please try again later.' });
					Logger.error(error);
				}
			}
		});

		this.router.get('/bots/:id/upvotes', this.rateLimit(1000 * 15, 2), this.getBot(), this.checkBotAuth(), async (req, res) => {
			const bot = res.locals.bot;

			const upvotes = await this.db.getAllBotUpvotes(bot.id, this.userAllowedFields);

			res.json(upvotes);
		});

		this.router.get('/bots/:id/uptime', this.rateLimit(1000 * 15, 30), this.getBot(), async (req, res) => {
			const bot = res.locals.bot;

			const uptime = await this.db.getUptime(bot.id);

			if (!uptime) return res.status(500).json({ success: false, code: 500, message: 'Failed to get uptime of the bot' });

			res.json({
				success: true,
				bot: bot.id,
				online_checks: uptime.online,
				total_checks: uptime.total,
				percent: uptime.online / uptime.total
			});
		});

		this.router.get('/users/:id', this.rateLimit(1000, 2), this.getUser(), async (req, res) => {
			const user = await this.db.getUserWithFields(res.locals.user.id, this.userAllowedFields);

			res.json({
				success: true,
				...user
			});
		});

		this.router.get('/users/:id/bots', this.rateLimit(1000 * 15, 10), this.getUser(), async (req, res) => {
			const user = res.locals.user;

			const bots = await this.db.getBotsByOwnerWithFields(user.id, this.botAllowedFields, this.userAllowedFields);

			res.json(bots);
		});

		this.router.use((req, res) => {
			res.status(404).json({ success: false, code: 404, message: 'API endpoint not found' });
		});
	}

	getBot() {
		return async (req, res, next) => {
			if (req.params.id.length > 100) return res.status(404).json({ code: 404, message: 'Bot does not exist' });

			const bot = await this.db.getBotVanity(req.params.id);

			if (!bot) return res.status(404).json({ code: 404, message: 'Bot does not exist' });

			res.locals.bot = bot;
			next();
		};
	}

	getUser() {
		return async (req, res, next) => {
			if (req.params.id.length > 100) return res.status(404).json({ code: 404, message: 'User does not exist' });

			const user = await this.db.getUser(req.params.id);

			if (!user) return res.status(404).json({ code: 404, message: 'User does not exist' });

			res.locals.user = user;
			next();
		};
	}

	checkBotAuth() {
		return (req, res, next) => {
			if (!req.get('Authorization')) return res.status(401).json({ code: 401, message: 'Missing Authorization header' });
			if (req.get('Authorization') !== res.locals.bot.token) return res.status(403).json({ code: 403, message: 'Invalid Authorization token' });

			next();
		};
	}

	rateLimit(windowMs, max) {
		return rateLimit({
			windowMs,
			max,
			keyGenerator: this.rateLimitKey,
			handler: this.rateLimitHandle,
			skip: this.rateLimitSkip
		});
	}
}

module.exports = v1;
