const MongoDB = require('mongodb');
const EventEmitter = require('events').EventEmitter;

class Database extends EventEmitter {
	constructor(parent) {
		super();

		Object.assign(this, parent);

		this.client = new MongoDB.MongoClient(process.env.MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
		this.db = null;

		this.ready = false;

		this.connect();
	}

	connect() {
		return this.client.connect()
			.then(() => {
				this.ready = true;

				this.emit('ready');

				this.db = this.client.db('botlist');
			});
	}

	getBotVanity(id) {
		return this.db
			.collection('bots')
			.findOne({ $or: [{ id }, { vanity: id }] });
	}

	getUser(id) {
		return this.db
			.collection('users')
			.findOne({ id });
	}

	getAllBotsCount() {
		return this.db
			.collection('bots')
			.countDocuments();
	}

	getAllUsersCount() {
		return this.db
			.collection('users')
			.countDocuments();
	}

	getUptime(id) {
		return this.db
			.collection('uptime')
			.findOne({ id });
	}

	updateBot(id, props) {
		return this.db
			.collection('bots')
			.updateOne({ id }, { $set: props });
	}

	getUserWithFields(id, fields) {
		const project = {};

		for (let i = 0; i < fields.length; i++) {
			project[fields[i]] = '$' + fields[i];
		}

		return this.db
			.collection('users')
			.aggregate([
				{ $match: { id } },
				{ $project: { _id: 0, ...project } }
			])
			.limit(1)
			.next();
	}

	getAllBotsWithFields(fields, userFields) {
		const project = {};

		for (let i = 0; i < fields.length; i++) {
			project[fields[i]] = '$' + fields[i];
		}

		const userProject = {};

		for (let i = 0; i < userFields.length; i++) {
			userProject[userFields[i]] = '$$owner.' + userFields[i];
		}

		return this.db
			.collection('bots')
			.aggregate([
				{ $project: { _id: 0, ...project } },
				{ $lookup: { from: 'libraries', localField: 'library', foreignField: 'id', as: 'library' } },
				{ $lookup: { from: 'users', localField: 'owners', foreignField: 'id', as: 'owners' } },
				{ $lookup: { from: 'tags', localField: 'tags', foreignField: 'id', as: 'tags' } },
				{ $addFields: { library: { $arrayElemAt: ['$library.name', 0] }, tags: '$tags.name', owners: { $map: { input: '$owners', as: 'owner', in: userProject } } } },
			])
			.toArray();
	}

	getBotWithFields(id, fields, userFields) {
		const project = {};

		for (let i = 0; i < fields.length; i++) {
			project[fields[i]] = '$' + fields[i];
		}

		const userProject = {};

		for (let i = 0; i < userFields.length; i++) {
			userProject[userFields[i]] = '$$owner.' + userFields[i];
		}

		return this.db
			.collection('bots')
			.aggregate([
				{ $match: { id } },
				{ $project: { _id: 0, ...project } },
				{ $lookup: { from: 'libraries', localField: 'library', foreignField: 'id', as: 'library' } },
				{ $lookup: { from: 'users', localField: 'owners', foreignField: 'id', as: 'owners' } },
				{ $lookup: { from: 'tags', localField: 'tags', foreignField: 'id', as: 'tags' } },
				{ $addFields: { library: { $arrayElemAt: ['$library.name', 0] }, tags: '$tags.name', owners: { $map: { input: '$owners', as: 'owner', in: userProject } } } },
			])
			.limit(1)
			.next();
	}

	getAllBotUpvotes(id, userFields) {
		const userProject = {};

		for (let i = 0; i < userFields.length; i++) {
			userProject[userFields[i]] = '$user.' + userFields[i];
		}

		return this.db
			.collection('bots')
			.aggregate([
				{ $match: { id } },
				{ $unwind: '$upvotes' },
				{ $lookup: { from: 'users', localField: 'upvotes.id', foreignField: 'id', as: 'user' } },
				{ $addFields: { user: { $arrayElemAt: ['$user', 0] }, timestamp: '$upvotes.timestamp' } },
				{ $project: { _id: 0, user: userProject, timestamp: 1 } }
			])
			.toArray();
	}

	getAllBotsApprovedCount() {
		return this.db
			.collection('bots')
			.find({ approved: true })
			.count();
	}

	getAllTagsCount() {
		return this.db
			.collection('tags')
			.countDocuments();
	}

	getBotsByOwnerWithFields(id, fields, userFields) {
		const project = {};

		for (let i = 0; i < fields.length; i++) {
			project[fields[i]] = '$' + fields[i];
		}

		const userProject = {};

		for (let i = 0; i < userFields.length; i++) {
			userProject[userFields[i]] = '$$owner.' + userFields[i];
		}

		return this.db
			.collection('bots')
			.aggregate([
				{ $match: { owners: { $in: [id] } } },
				{ $lookup: { from: 'libraries', localField: 'library', foreignField: 'id', as: 'library' } },
				{ $lookup: { from: 'users', localField: 'owners', foreignField: 'id', as: 'owners' } },
				{ $lookup: { from: 'tags', localField: 'tags', foreignField: 'id', as: 'tags' } },
				{ $addFields: { library: { $arrayElemAt: ['$library.name', 0] }, tags: '$tags.name', owners: { $map: { input: '$owners', as: 'owner', in: userProject } } } },
				{ $project: { _id: 0, ...project } }
			])
			.toArray();
	}

	getBot(id) {
		return this.db
			.collection('bots')
			.findOne({ id });
	}
}

module.exports = Database;