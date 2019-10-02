// Uncomment following to enable zipkin tracing, tailor to fit your network configuration:
// var appzip = require('appmetrics-zipkin')({
//     host: 'localhost',
//     port: 9411,
//     serviceName:'frontend'
// });

require('appmetrics-dash').attach();
require('appmetrics-prometheus').attach();
const appName = require('./../package').name;
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const log4js = require('log4js');
const localConfig = require('./config/local.json');
const path = require('path');
const AssistantV2 = require('ibm-watson/assistant/v2'); // watson sdk

let db;
let cloudant;
let dbCredentials = {
  dbName: 'first-app',
  url: 'https://08a0d4c2-77ad-4ed0-8376-b6efa56bb1dd-bluemix:e404e02bdc9a556418781b8194439bc464510807c9fe0b1e9272e9e7d53d8488@08a0d4c2-77ad-4ed0-8376-b6efa56bb1dd-bluemix.cloudantnosqldb.appdomain.cloud'
};

const logger = log4js.getLogger(appName);
logger.level = process.env.LOG_LEVEL || 'info';
const app = express();
const server = http.createServer(app);

app.use(log4js.connectLogger(logger, {
  level: logger.level
}));
const serviceManager = require('./services/service-manager');
require('./services/index')(app);
require('./routers/index')(app, server);

// req.body will be available for Content-Type=application/json
app.use(bodyParser.json());
// Create the service wrapper
const assistant = new AssistantV2({
  iam_apikey: 'qI2nZyEdGjGiLLMbXW-YwQySwyGbmx36MZhEu1EEZGrl',
  url: 'https://gateway-syd.watsonplatform.net/assistant/api',
  version: '2019-02-28'
});

//Cloudant
function initDBConnection() {
  cloudant = require('@cloudant/cloudant')(dbCredentials.url);
  // check if DB exists if not create
  cloudant.db.create(dbCredentials.dbName, function (err, res) {
    if (err) {
      console.log('DB: ' + dbCredentials.dbName + ' already exist.');
    } else {
      console.log('DB success');
    }
  });

  db = cloudant.use(dbCredentials.dbName);
}
initDBConnection();

function createResponseData(id, message) {
  var responseData = {
    id: id,
    message: sanitizeInput(message)
  };
  return responseData;
}
var saveDocument = function (id, message, response) {
  if (id === undefined) {
    // Generated random id
    id = '';
  }
  db.insert({
    message: message
  }, id, function (err, doc) {
    if (err) {
      console.log(err);
      response.sendStatus(500);
    } else
      response.sendStatus(200);
    response.end();
  });
}

// Add your code here
// Endpoint to be call from the client side
app.post('/api/message', function (req, res) {
  const assistantId = process.env.ASSISTANT_ID || localConfig.ASSISTANT_ID || '<assistant-id>';
  if (!assistantId || assistantId === '<assistant-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>ASSISTANT_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/assistant-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/assistant-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }

  let textIn = '';
  if (req.body.input) {
    textIn = req.body.input.text;
  }

  let payload = {
    assistant_id: assistantId,
    session_id: req.body.session_id,
    input: {
      message_type: 'text',
      text: textIn
    }
  };

  // Send the input to the assistant service
  assistant.message(payload, function (err, data) {
    if (err) {
      const status = (err.code !== undefined && err.code > 0) ? err.code : 500;
      return res.status(status).json(err);
    }

    return res.json(data);
  });
});
app.get('/api/session', function (req, res) {
  assistant.createSession({
    assistant_id: process.env.ASSISTANT_ID || localConfig.ASSISTANT_ID,
  }, function (error, response) {
    if (error) {
      return res.send(error);
    } else {
      return res.send(response);
    }
  });
});

// DB API
app.post('/api/db/message/insert', function (request, response) {
  db.get(request.query.id, function (err, existingdoc) {
    let isExistingDoc = false;
    if (existingdoc) {
      isExistingDoc = true;
    }
    let message = sanitizeInput(request.query.message);
    let file = request.files.file;
    if (!isExistingDoc) {
      // save doc
      db.insert({
        message: message
      }, '', function (err, doc) {
        if (err) {
          console.log(err);
        } else {
          existingdoc = doc;
          console.log("Success..");
        }
      });
    } else {
      console.log('Adding message to existing id..');
    }
  });
});
app.post('/api/db/message', function (req, res) {
  var message = sanitizeInput(req.body.message);
  console.log("message: " + message);
  saveDocument(null, message, res);
});

const port = process.env.PORT || localConfig.port;
server.listen(port, function () {
  logger.info(`FirstApp listening on http://localhost:${port}/appmetrics-dash`);
  logger.info(`FirstApp listening on http://localhost:${port}`);
});

app.use(function (req, res, next) {
  res.sendFile(path.join(__dirname, '../public', '404.html'));
});

app.use(function (err, req, res, next) {
  res.sendFile(path.join(__dirname, '../public', '500.html'));
});

module.exports = server;