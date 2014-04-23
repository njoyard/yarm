/*jshint node:true */
"use strict";

var yarm = require("./yarm");

var hasMongoose = false;
try {
	require("mongoose");
	hasMongoose = true;
} catch(e) {}


function instanciate() {
	var instance = yarm();

	/* Add native extension */
	instance.extend("native", require("./native"));

	/* Add mongoose extensions if mongoose is present */
	if (hasMongoose) {
		instance.extend("mongoose", require("./mongoose/model"));
		instance.extend("aggregate", require("./mongoose/aggregate"));
	}

	return instance;
}


module.exports = instanciate();
module.exports.newInstance = instanciate;

