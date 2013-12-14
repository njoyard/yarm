/*jshint node:true*/
"use strict";


/*!
 * Search query helpers
 */


var queryRegex = /^\/(.*)\/([imx]*)$/;

/* Generate a mongoose query operator from a ?query= request parameter */
function createQueryOperator(query) {
	var or = {
		$or: query.split(" OR ").map(function(orOperand) {
			var and = {
				$and: orOperand.split(" AND ").map(function(andOperand) {
					var colonIndex = andOperand.indexOf(":"),
						bangIndex = andOperand.indexOf("!");

					if (colonIndex === -1 && bangIndex === -1) {
						// Invalid operator, skip
						return {};
					}

					var negate = colonIndex === -1 || (bangIndex !== -1 && bangIndex < colonIndex),
						split = andOperand.split(negate ? "!" : ":"),
						field = split[0],
						value = split[1],
						operator = {},
						op, matches;

					matches = value.match(queryRegex);

					if (matches) {
						op = new RegExp(matches[1], matches[2]);
						operator[field] = negate ? { $not: op } : op;
					} else {
						if (negate) {
							// Mongoose does not handle { $not: "value" }
							operator[field] = { $nin: [value] };
						} else {
							operator[field] = value;
						}
					}

					return operator;
				}).filter(function(operator) {
					return Object.keys(operator).length > 0;
				})
			};

			return and.$and.length === 1 ? and.$and[0] : and;
		})
	};

	return or.$or.length === 1 ? or.$or[0] : or;
}


/* Get property path value in a document or in a plain object */
function getPath(obj, path) {
	if (typeof obj.get === "function") {
		return obj.get(path);
	}

	var parts = path.split(".");

	while (parts.length) {
		if (!obj) {
			return;
		}

		obj = obj[parts.shift()];
	}

	return obj;
}


/* Match a mongoose query criterion to a document */
function matchQueryCriterion(crit, doc) {
	return Object.keys(crit).every(function(path) {
		var value = getPath(doc, path) || "",
			match = crit[path],
			negate = false,
			result;

		if (typeof match === "string") {
			result = value.toString() === match;
		} else {
			if ("$not" in match) {
				negate = true;
				match = match.$not;
			}

			if (match instanceof RegExp) {
				result = !!value.toString().match(match);
			} else if ("$nin" in match) {
				result = match.$nin.indexOf(value) === -1;
			} else {
				return false;
			}
		}

		return negate ? !result : result;
	});
}


/* Match a mongoose query operator to a document */
function matchQueryOperator(operator, doc) {
	if ("$or" in operator) {
		return operator.$or.some(function(op) {
			return matchQueryOperator(op, doc);
		});
	} else if ("$and" in operator) {
		return operator.$and.every(function(op) {
			return matchQueryOperator(op, doc);
		});
	} else if ("$not" in operator) {
		return !matchQueryOperator(operator.$not, doc);
	} else {
		return matchQueryCriterion(operator, doc);
	}
}


module.exports = {
	create: createQueryOperator,
	match: matchQueryOperator
};