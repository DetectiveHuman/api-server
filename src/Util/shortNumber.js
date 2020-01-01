const units = {
	'K': 6,
	'M': 9,
	'B': 12,
	'T': 16
};

module.exports = (number, precision = 0.1, formula = Math.round) => {
	if (Math.abs(number) < 1000) return number;

	precision = 1 / precision;

	const length = number.toString().length;
	const shortNumber = formula(precision * (number / Math.pow(10, length % 3 === 0 ? length - 3 : length - (length % 3)))) / precision;

	let result = shortNumber;

	for (const unit in units) {
		if (length < units[unit]) {
			result += unit;
			break;
		}
	}

	return result;
};