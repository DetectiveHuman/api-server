const fs = require('fs').promises;
const snekfetch = require('snekfetch');
const svgo = require('svgo');
const path = require('path');
const pug = require('pug');
const opentype = require('opentype.js');
const express = require('express');
const Route = require('../Structure/Route');
const Collection = require('../Structure/Collection');
const shortNumber = require('../Util/shortNumber');

const round = (x, precision) => {
	return Math.round(x * precision) / precision;
};

class Widget extends Route {
	constructor(parent) {
		super({
			position: 1,
			route: '/widget'
		});

		Object.assign(this, parent);

		this.widgetOptions = {
			shadows: true,
			rounded: false,
			background: null
		};

		this.widgets = new Collection();
		this.fonts = new Collection();
		this.styles = new Collection();
		this.background = null;
		this.invertedBackground = null;
		this.darkBackground = null;

		this.router = express.Router();
		this.svgo = new svgo();

		this.loadStyles();
		this.loadBackgrounds();
		this.setup();
	}

	setup() {
		this.router.get('/:bot/:style', async (req, res) => {
			const bot = await this.db.getBot(req.params.bot);

			if (!bot) return res.status(404).json({ code: 404, message: 'Bot not found' });

			const options = Object.assign({}, this.widgetOptions);

			for (const key in req.query) {
				if (key in this.widgetOptions) {
					if (key === 'background') {
						options[key] = req.query[key];
						continue;
					}
					options[key] = req.query[key] === 'true' || req.query[key] === 'yes' || (req.query[key] === '' && !this.widgetOptions[key]);
				}
			}

			if (!this.styles.has(req.params.style + '.pug')) return res.status(404).json({ code: 404, message: 'Unknown widget style' });

			const key = JSON.stringify([bot.id, req.params.style, ...Object.entries(options).map((entry) => entry[0] + ':' + entry[1])]);
			const widget = this.widgets.get(key);

			let data = {};

			if (widget && Date.now() - widget.timestamp < 1000 * 60 * 15) {
				data = widget.data;
			} else {
				const generatedWidget = await this.getWidget(bot, req.params.style, options);

				this.widgets.set(key, { timestamp: Date.now(), data: generatedWidget });

				data = generatedWidget;
			}

			res.set('Content-Type', 'image/svg+xml').send(data);
		});
	}

	async getWidget(bot, style, options) {
		return new Promise(async (resolve, reject) => {
			bot.uptime = await this.db.getUptime(bot.id);

			opentype.load(path.join(__dirname, '..', 'Assets', 'Fonts', 'CircularStd-Bold.woff'), async (error, bold) => {
				if (error) return reject(error);

				opentype.load(path.join(__dirname, '..', 'Assets', 'Fonts', 'CircularStd-Book.woff'), async (error, book) => {
					if (error) return reject(error);

					const avatar = await snekfetch.get(bot.avatar ? 'https://cdn.discordapp.com/avatars/' + bot.id + '/' + bot.avatar + '.' + (bot.avatar.startsWith('a_') ? 'gif' : 'png') + '?size=256' : 'https://cdn.discordapp.com/embed/avatars/0.png').then((result) => result.body.toString('base64'));

					const titlePath = this.formatText(bold, bot.username, 36, 322, 1);
					const titleBoundary = titlePath.boundary;

					const descriptionPath = this.formatText(book, bot.short_description, 16, 322, 3);
					const descriptionBoundary = descriptionPath.boundary;

					const statsPath = this.formatText(book, shortNumber(bot.upvotes.length, 0.01) + ' upvotes' + (bot.server_count ? '  |  ' + shortNumber(bot.server_count, 0.01) + ' servers' : '') + (bot.uptime ? '  |  ' + Math.round((bot.uptime.online / bot.uptime.total) * 100) + '% uptime' : ''), 16, 322, 1);
					const statsBoundary = descriptionPath.boundary;

					const titleHeight = titleBoundary.y2 - titleBoundary.y1;
					const descriptionHeight = descriptionBoundary.y2 - descriptionBoundary.y1;
					const statsHeight = statsBoundary.y2 - statsBoundary.y1;

					const textSpacing = 15;
					const combinedHeight = titleHeight + descriptionHeight + statsHeight + textSpacing * 2;

					const titleY = (210 - combinedHeight) / 2 + (descriptionPath.lines / 3) * (descriptionHeight / descriptionPath.lines);
					const descriptionY = titleY + titleHeight + textSpacing;
					const statsY = descriptionY + descriptionHeight + textSpacing;

					const render = pug.render(this.styles.get(style + '.pug'), {
						bot,
						titlePath: this.getPath(titlePath.commands),
						titlePosition: { x: 210, y: Math.abs(titleBoundary.y1) + titleY },
						descriptionPath: this.getPath(descriptionPath.commands),
						descriptionPosition: { x: 210, y: Math.abs(descriptionBoundary.y1) + descriptionY },
						statsPath: this.getPath(statsPath.commands),
						statsPosition: { x: 210, y: Math.abs(statsBoundary.y1) + statsY },
						options,
						avatar,
						background: this.background,
						darkBackground: this.darkBackground,
						invertedBackground: this.invertedBackground,
						logo: this.logo
					});

					const compressed = await this.svgo.optimize(render);

					resolve(compressed.data);
				});
			});
		});
	}

	formatText(font, text, fontSize, maxWidth, maxLines) {
		let iterations = 0;
		let thisText = text;
		let y = 0;
		let index = 0;
		let result = {
			boundary: { x1: 0, y1: 0, x2: 0, y2: 0 },
			commands: [],
			lines: 0
		};

		while (true) { // eslint-disable-line
			if (index >= text.length || iterations > 1000) return result;

			let path = font.getPath(thisText.trim(), 0, y, fontSize);
			let boundary = path.getBoundingBox();
			const width = boundary.x2 - boundary.x1;

			iterations++;

			if (width > maxWidth) {
				thisText = thisText.slice(0, thisText.lastIndexOf(' '));
			} else {
				result.lines++;

				if (result.lines >= maxLines && text.indexOf(thisText) + thisText.length < text.length) {
					path = font.getPath(thisText.trim() + '...', 0, y, fontSize);
					boundary = path.getBoundingBox();
				}

				if (boundary.x1 < result.boundary.x1) {
					result.boundary.x1 = boundary.x1;
				}

				if (boundary.y1 < result.boundary.y1) {
					result.boundary.y1 = boundary.y1;
				}

				if (boundary.x2 > result.boundary.x2) {
					result.boundary.x2 = boundary.x2;
				}

				if (boundary.y2 > result.boundary.y2) {
					result.boundary.y2 = boundary.y2;
				}

				result.commands.push(...path.commands);
				index += thisText.length;
				y += 18;
				thisText = text.slice(index);

				if (result.lines >= maxLines) {
					return result;
				}
			}
		}
	}

	getPath(commands) {
		return commands.map((command) => command.type + ('x1' in command ? round(command.x1, 100) + ' ' + round(command.y1, 100) + ', ' + round(command.x2, 100) + ' ' + round(command.y2, 100) + ', ' : '') + ('x' in command ? round(command.x, 100) + ' ' + round(command.y, 100) : '')).join('');
	}

	async loadStyles() {
		const directory = path.join(__dirname, '..', 'Assets', 'Widgets');

		const styles = await fs.readdir(directory);

		for (let i = 0; i < styles.length; i++) {
			const style = await fs.readFile(path.join(directory, styles[i]));

			this.styles.set(styles[i], style);
		}
	}

	async loadBackgrounds() {
		const background = await fs.readFile(path.join(__dirname, '..', 'Assets', 'Images', 'background.svg'), 'base64');
		this.background = background;

		const darkBackground = await fs.readFile(path.join(__dirname, '..', 'Assets', 'Images', 'background-dark.svg'), 'base64');
		this.darkBackground = darkBackground;

		const invertedBackground = await fs.readFile(path.join(__dirname, '..', 'Assets', 'Images', 'background-inverted.svg'), 'base64');
		this.invertedBackground = invertedBackground;

		const logo = await fs.readFile(path.join(__dirname, '..', 'Assets', 'Images', 'logo.png'), 'base64');
		this.logo = logo;
	}
}

module.exports = Widget;
