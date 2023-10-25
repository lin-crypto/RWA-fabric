/*
# Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# 
# Licensed under the Apache License, Version 2.0 (the "License").
# You may not use this file except in compliance with the License.
# A copy of the License is located at
# 
#     http://www.apache.org/licenses/LICENSE-2.0
# 
# or in the "license" file accompanying this file. This file is distributed 
# on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either 
# express or implied. See the License for the specific language governing 
# permissions and limitations under the License.
#
*/

'use strict';
var log4js = require('log4js');
log4js.configure({
	appenders: {
		out: { type: 'stdout' },
	},
	categories: {
		default: { appenders: ['out'], level: 'info' },
	}
});
var logger = log4js.getLogger('NGOAPI');
const WebSocketServer = require('ws');
var express = require('express');
var bodyParser = require('body-parser');
var http = require('http');
var util = require('util');
var app = express();
var cors = require('cors');
var hfc = require('fabric-client');
const uuidv4 = require('uuid/v4');

var connection = require('./connection.js');
var query = require('./query.js');
var invoke = require('./invoke.js');
var blockListener = require('./blocklistener.js');

hfc.addConfigFile('config.json');
var host = 'localhost';
var port = 3000;
var username = "";
var orgName = "";
var channelName = hfc.getConfigSetting('channelName');
var chaincodeName = hfc.getConfigSetting('chaincodeName');
var peers = hfc.getConfigSetting('peers');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

///////////////////////////////////////////////////////////////////////////////
//////////////////////////////// SET CONFIGURATIONS ///////////////////////////
///////////////////////////////////////////////////////////////////////////////
app.options('*', cors());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(function (req, res, next) {
	logger.info(' ##### New request for URL %s', req.originalUrl);
	return next();
});

//wrapper to handle errors thrown by async functions. We can catch all
//errors thrown by async functions in a single place, here in this function,
//rather than having a try-catch in every function below. The 'next' statement
//used here will invoke the error handler function - see the end of this script
const awaitHandler = (fn) => {
	return async (req, res, next) => {
		try {
			await fn(req, res, next)
		}
		catch (err) {
			next(err)
		}
	}
}

///////////////////////////////////////////////////////////////////////////////
//////////////////////////////// START SERVER /////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var server = http.createServer(app).listen(port, function () { });
logger.info('****************** SERVER STARTED ************************');
logger.info('***************  Listening on: http://%s:%s  ******************', host, port);
server.timeout = 240000;

function getErrorMessage(field) {
	var response = {
		success: false,
		message: field + ' field is missing or Invalid in the request'
	};
	return response;
}

///////////////////////////////////////////////////////////////////////////////
//////////////////////////////// START WEBSOCKET SERVER ///////////////////////
///////////////////////////////////////////////////////////////////////////////
const wss = new WebSocketServer.Server({ server });
wss.on('connection', function connection(ws) {
	logger.info('****************** WEBSOCKET SERVER - received connection ************************');
	ws.on('message', function incoming(message) {
		console.log('##### Websocket Server received message: %s', message);
	});

	ws.send('something');
});
// Swagger setup
const swaggerOptions = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'RWA API',
			version: '1.0.0',
			description: 'API documentation using Swagger',
		},
		servers: [
			{
				url: 'http://localhost:5000', // Replace with your server URL
			},
		],
	},
	apis: ['app.js'], // Replace with the path to your route files
};
///////////////////////////////////////////////////////////////////////////////
///////////////////////// REST ENDPOINTS START HERE ///////////////////////////
///////////////////////////////////////////////////////////////////////////////
// Health check - can be called by load balancer to check health of REST API

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', awaitHandler(async (req, res) => {
	res.sendStatus(200);
}));

// Register and enroll user. A user must be registered and enrolled before any queries 
// or transactions can be invoked
app.post('/users', awaitHandler(async (req, res) => {
	logger.info('================ POST on Users');
	username = req.body.username;
	orgName = req.body.orgName;
	logger.info('##### End point : /users');
	logger.info('##### POST on Users- username : ' + username);
	logger.info('##### POST on Users - userorg  : ' + orgName);
	let response = await connection.getRegisteredUser(username, orgName, true);
	logger.info('##### POST on Users - returned from registering the username %s for organization %s', username, orgName);
	logger.info('##### POST on Users - getRegisteredUser response secret %s', response.secret);
	logger.info('##### POST on Users - getRegisteredUser response secret %s', response.message);
	if (response && typeof response !== 'string') {
		logger.info('##### POST on Users - Successfully registered the username %s for organization %s', username, orgName);
		logger.info('##### POST on Users - getRegisteredUser response %s', response);
		// Now that we have a username & org, we can start the block listener
		await blockListener.startBlockListener(channelName, username, orgName, wss);
		res.json(response);
	} else {
		logger.error('##### POST on Users - Failed to register the username %s for organization %s with::%s', username, orgName, response);
		res.json({ success: false, message: response });
	}
}));

// GET a specific Rating
app.post('/asset', awaitHandler(async (req, res) => {
	logger.info('================ GET on Rating by ID');
	logger.info('Rating ID : ' + util.inspect(req.params));
	let args = req.params;
	let fcn = "createAsset";

	logger.info('##### GET on Rating - username : ' + username);
	logger.info('##### GET on Rating - userOrg : ' + orgName);
	logger.info('##### GET on Rating - channelName : ' + channelName);
	logger.info('##### GET on Rating - chaincodeName : ' + chaincodeName);
	logger.info('##### GET on Rating - fcn : ' + fcn);
	logger.info('##### GET on Rating - args : ' + JSON.stringify(args));
	logger.info('##### GET on Rating - peers : ' + peers);

	let message = await query.queryChaincode(peers, channelName, chaincodeName, args, fcn, username, orgName);
	res.send(message);
}));

// GET a specific Rating
app.get('/asset', awaitHandler(async (req, res) => {
	logger.info('================ GET on Rating by ID');
	logger.info('Rating ID : ' + util.inspect(req.params));
	let args = req.params;
	let fcn = "getAsset";

	logger.info('##### GET on Rating - username : ' + username);
	logger.info('##### GET on Rating - userOrg : ' + orgName);
	logger.info('##### GET on Rating - channelName : ' + channelName);
	logger.info('##### GET on Rating - chaincodeName : ' + chaincodeName);
	logger.info('##### GET on Rating - fcn : ' + fcn);
	logger.info('##### GET on Rating - args : ' + JSON.stringify(args));
	logger.info('##### GET on Rating - peers : ' + peers);

	let message = await query.queryChaincode(peers, channelName, chaincodeName, args, fcn, username, orgName);
	res.send(message);
}));


// GET a specific Rating
app.put('/asset', awaitHandler(async (req, res) => {
	logger.info('================ GET on Rating by ID');
	logger.info('Rating ID : ' + util.inspect(req.params));
	let args = req.params;
	let fcn = "updateAsset";

	logger.info('##### GET on Rating - username : ' + username);
	logger.info('##### GET on Rating - userOrg : ' + orgName);
	logger.info('##### GET on Rating - channelName : ' + channelName);
	logger.info('##### GET on Rating - chaincodeName : ' + chaincodeName);
	logger.info('##### GET on Rating - fcn : ' + fcn);
	logger.info('##### GET on Rating - args : ' + JSON.stringify(args));
	logger.info('##### GET on Rating - peers : ' + peers);

	let message = await invoke.queryChaincode(peers, channelName, chaincodeName, args, fcn, username, orgName);
	res.send(message);
}));

// Delete asset
app.delete('/asset', awaitHandler(async (req, res) => {
	logger.info('================ Del ID');
	logger.info('Rating ID : ' + util.inspect(req.params));
	let args = req.params;
	let fcn = "deleteAsset";

	logger.info('##### GET on Rating - username : ' + username);
	logger.info('##### GET on Rating - userOrg : ' + orgName);
	logger.info('##### GET on Rating - channelName : ' + channelName);
	logger.info('##### GET on Rating - chaincodeName : ' + chaincodeName);
	logger.info('##### GET on Rating - fcn : ' + fcn);
	logger.info('##### GET on Rating - args : ' + JSON.stringify(args));
	logger.info('##### GET on Rating - peers : ' + peers);

	let message = await invoke.queryChaincode(peers, channelName, chaincodeName, args, fcn, username, orgName);
	res.send(message);
}));




// Transfer asset
app.post('/transfer', awaitHandler(async (req, res) => {
	logger.info('================ Transfer asset');
	logger.info('asset ID : ' + util.inspect(req.params));
	let args = req.params;
	let fcn = "transferAsset";

	logger.info('##### GET on Rating - username : ' + username);
	logger.info('##### GET on Rating - userOrg : ' + orgName);
	logger.info('#### GET on Rating - channelName : ' + channelName);
	logger.info('##### GET on Rating - chaincodeName : ' + chaincodeName);
	logger.info('##### GET on Rating - fcn : ' + fcn);
	logger.info('##### GET on Rating - args : ' + JSON.stringify(args));
	logger.info('##### GET on Rating - peers : ' + peers);

	let message = await invoke.queryChaincode(peers, channelName, chaincodeName, args, fcn, username, orgName);
	res.send(message);
}));



/************************************************************************************
 * Utility function for creating dummy spend records. Mimics the behaviour of an NGO
 * spending funds, which are allocated against donations
 ************************************************************************************/

async function dummySpend() {
	if (!username) {
		return;
	}
	// first, we get a list of donations and randomly choose one
	let args = {};
	let fcn = "queryAllDonations";

	logger.info('##### dummySpend GET on Donation - username : ' + username);
	logger.info('##### dummySpend GET on Donation - userOrg : ' + orgName);
	logger.info('##### dummySpend GET on Donation - channelName : ' + channelName);
	logger.info('##### dummySpend GET on Donation - chaincodeName : ' + chaincodeName);
	logger.info('##### dummySpend GET on Donation - fcn : ' + fcn);
	logger.info('##### dummySpend GET on Donation - args : ' + JSON.stringify(args));
	logger.info('##### dummySpend GET on Donation - peers : ' + peers);

	let message = await query.queryChaincode(peers, channelName, chaincodeName, args, fcn, username, orgName);
	let len = message.length;
	if (len < 1) {
		logger.info('##### dummySpend - no donations available');
	}
	logger.info('##### dummySpend - number of donation record: ' + len);
	if (len < 1) {
		return;
	}
	let ran = Math.floor(Math.random() * len);
	logger.info('##### dummySpend - randomly selected donation record number: ' + ran);
	logger.info('##### dummySpend - randomly selected donation record: ' + JSON.stringify(message[ran]));
	let ngo = message[ran]['ngoRegistrationNumber'];
	logger.info('##### dummySpend - randomly selected ngo: ' + ngo);

	// then we create a spend record for the NGO that received the donation
	fcn = "createSpend";
	let spendId = uuidv4();
	let spendAmt = Math.floor(Math.random() * 100) + 1;

	args = {};
	args["ngoRegistrationNumber"] = ngo;
	args["spendId"] = spendId;
	args["spendDescription"] = "Peter Pipers Poulty Portions for Pets";
	args["spendDate"] = "2018-09-20T12:41:59.582Z";
	args["spendAmount"] = spendAmt;

	logger.info('##### dummySpend - username : ' + username);
	logger.info('##### dummySpend - userOrg : ' + orgName);
	logger.info('##### dummySpend - channelName : ' + channelName);
	logger.info('##### dummySpend - chaincodeName : ' + chaincodeName);
	logger.info('##### dummySpend - fcn : ' + fcn);
	logger.info('##### dummySpend - args : ' + JSON.stringify(args));
	logger.info('##### dummySpend - peers : ' + peers);

	message = await invoke.invokeChaincode(peers, channelName, chaincodeName, args, fcn, username, orgName);
}

(function loop() {
	var rand = Math.round(Math.random() * (20000 - 5000)) + 5000;
	setTimeout(function () {
		dummySpend();
		loop();
	}, rand);
}());

/************************************************************************************
 * Error handler
 ************************************************************************************/

app.use(function (error, req, res, next) {
	res.status(500).json({ error: error.toString() });
});

