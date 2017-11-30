'use strict';
const AWS = require('aws-sdk');
const Promise = require('bluebird');
const bcrypt = require('bcryptjs');
const Alexa = require('alexa-sdk');
const APP_ID = process.env.APPLICATION_ID;
const DEBUG = process.env.DEBUG_EN;
const GmailSend = require('gmail-send');
const session_table = "session";
const department_table = "departments";
const faculty_table = "faculty";
const student_table = "students";
const emailSender = 'comp4968alexatts@gmail.com';
const password = 'comp4968';

AWS.config.setPromisesDependency(require('bluebird'));
var docClient = new AWS.DynamoDB.DocumentClient();
Promise.promisifyAll(docClient);

function debugLog(msg) {
    if (DEBUG) 
        console.error(msg);
};


function toTitleCase(str) {
    return str.replace(/\w\S*/g, txt => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

function nomalizeStudentId(str) {
    const idLength = 9;
    var pattern = 'A00000000';
    return pattern.substr(0, idLength - str.length) + str;   
} 

function sendGmail(email) {
    debugLog('email content: ');
    debugLog(email);
    var send = GmailSend(email); 
    return new Promise((resolve, reject) => { 
        send({}, (err, res) => {
            if (err)
                reject(err);
            else
                resolve(res);
        });
    });
}

function getDepartmentByName(departmentName) {
    var params ={
        TableName: department_table,
        Key : {
            "name": departmentName
        }
    }; 

    return docClient.get(params)
        .promise()
        .then(data => {
            if (Object.keys(data).length != 0)
                return Promise.resolve(data.Item);
            return data;
        });
}


function getStudentById(studentId) {
    var params ={
        TableName : student_table,
        Key : {
            "id" : studentId 
        }
    }; 

    return docClient.get(params)
        .promise()
        .then(data => {
            if (Object.keys(data).length != 0) {
                return data.Item;
            }
        });
}

function getInstructor(name) {
    var params = {
        TableName : faculty_table,
        Key : {
           "name" : name
        }
    };

    return docClient.get(params)
        .promise()
        .then( data => {
            return data.Item;
        });
} 

function createSession(session) {
    var params = {
        TableName : session_table,
        Item: session 
    };
    debugLog(params);
    return docClient.put(params).promise();
} 

function updateSession(sessionId, updates) {
    debugLog('Start update session');
    debugLog(updates);
    var params = {
        TableName : session_table,
        Key : {
            "id": sessionId
        },
        UpdateExpression: updates.UpdateExpression,
        ExpressionAttributeValues: updates.ExpressionAttributeValues
    };
    return docClient.update(params).promise();
}

function getSessionFromDb(sessionId) {
    var params ={
        TableName : session_table,
        Key : {
            "id": sessionId
        }
    }; 

    return docClient.get(params)
        .promise()
        .then(data=>{
            if (Object.keys(data).length != 0) {
                return data.Item; 
            }
        });
}

function deleteSessionFromDb(sessionId) {
    var params = {
        TableName : session_table,
        Key : {
            "id" : sessionId
        }
    };

    return docClient.delete(params).promise();
}

function generateVerificationCode(sessionId) {
    var rand = '' + Math.floor(Math.random() * 1000000);
    debugLog('Generating hash...');

    var salt = bcrypt.genSaltSync(10);
    var hash = bcrypt.hashSync(rand, salt);

    var updates = {
        UpdateExpression : "set verifycode = :code",
        ExpressionAttributeValues : {
            ':code' : hash 
        }
    };
    return updateSession(sessionId, updates).then(() => {
        return {
            text : rand,
            hash : hash
        };
    });
}

const launchRequestHandler = function () {
    this.emit(':ask','Welcome to B.C.I.T contact book. What are you searching for?');
};

const searchPublicContactIntentHandler = function(){
    var departmentName = this.event.request.intent.slots.departmentName.value;
    debugLog(departmentName);

    getDepartmentByName(toTitleCase(departmentName))
        .then(department => {
            var speechText = "";
            if (Object.keys(department).length != 0) {
                debugLog(department);
                speechText = 'The phone number of the ' + departmentName + ' is <say-as interpret-as="telephone">' + department.phone + '</say-as>'; 
            } else {
                speechText = 'Sorry, no result is found.'; 
            }
            this.response.speak(speechText)
                .listen('You can try another search');
            this.emit(':responseReady');
        })
        .catch(error => {
            this.emit('SessionEndedRequest');
        });

};

var searchPrivateContactIntentHandler = function() {
    var personName = toTitleCase(this.event.request.intent.slots.personName.value);
    var sessionId = this.event.session.sessionId;
    var speechText = "";

    debugLog(personName);

    getSessionFromDb(sessionId).then(session => {
        debugLog(session);
        if (session && session.authenticated) {
            return getInstructor(personName)
                .then(instructor => {
                    if (instructor)
                        speechText = "The phone number of " + personName + " is : <say-as interpret-as=\"telephone\"" + instructor.phone + "</say-as>"; 
                    else 
                        speechText = "Sorry, no result is found."
                    this.response.speak(speechText).listen('What else are you searching for?');
                    this.emit(':responseReady');
                });
            }
            return session; 
        })
        .then(session => {
            if (!session) {
            session = {
                id : sessionId,
                authenticated: false,
                verifycode: "null"
            };
            return createSession(session);
            }
            return session;
        })
        .then((session)=>{
            speechText = "Sorry, the information your are searching for requires authentication. Please tell me your student number."
            this.response.speak(speechText).listen('please tell me your student number to verify your identity.');
            this.emit(':responseReady');
            
        })
        .catch(error => {
            debugLog(error);
            this.emit('SessionEndedRequest');
        });
};

var sendVerificationCodeIntentHandler = function () {
    var studentId = nomalizeStudentId(this.event.request.intent.slots.studentId.value);
    var sessionId = this.event.session.sessionId;
    var receiver = ''; 
    debugLog(studentId);

    getStudentById(studentId).then(student =>{
        if (!student) {
            this.response.speak('Sorry, the student I.D is incorrect. Please tell me your student I.D').listen('Please tell me your student I.D');
            this.emit(':responseReady');
        } 
        receiver = student.email;
        return generateVerificationCode(sessionId); 
    }).then(code =>{
        var email = {
            user : emailSender,
            pass : password,
            to : receiver,
            subject : 'Verification Code for BCIT contact book',
            text : code.text
        };
        return sendGmail(email);
    }).then(sendResult => {
        debugLog(sendResult);
        this.response
            .speak('A verifcation code has been sent to your registered email address, Please read your email and tell me the verification code.')
            .listen('Please tell me the verification code');
        this.emit(':responseReady');
    }).catch(error => {
        debugLog(error);
    });
};

var getVerificationCodeHandler = function() {
    var code = this.event.request.intent.slots.verificationCode.value;
    var sessionId = this.event.session.sessionId;

    getSessionFromDb(sessionId).then(session => {
        if (bcrypt.compareSync(code, session.verifycode)) {

            var updates = {
                UpdateExpression : "set verifycode = :code, authenticated = :auth",
                ExpressionAttributeValues : {
                    ':code' : 'null',
                    ':auth' : true
                }
            };
            return updateSession(sessionId, updates)
        } else {
            this.response.speak('Sorry, the code is ivalid. Please try again.')
                .listen('Please check your email and tell me the verification code.')
            this.emit(':responseReady');
        }
    }).then((authenticated)=>{
        this.response.speak('You have been authenticated. Try a new search now.')
            .listen('What are you searching for?')
        this.emit(':responseReady');

    }).catch(error=>{
        debugLog(error);
    });  
};

var endSessionHandler = function() {
    // do other clean up jobs
    var sessionId = this.event.session.sessionId;
    deleteSessionFromDb(sessionId);

    this.response.speak('Thanks for using bcit contact book. Bye!');
    this.emit(':responseReady');
};

var handlers = {
    'LaunchRequest': launchRequestHandler,
    'searchPublicContactIntent': searchPublicContactIntentHandler,
    'searchPrivateContactIntent': searchPrivateContactIntentHandler,
    'sendVerificationCodeIntent' : sendVerificationCodeIntentHandler,
    'getVerificationCodeIntent' : getVerificationCodeHandler,
    'AMAZON.CancelIntent': endSessionHandler,
    'AMAZON.StopIntent': endSessionHandler,
    'SessionEndedRequest': endSessionHandler,
    'Unhandled': function () {
        debugLog('Unhandled function');
        this.emit(':ask', 'I don\'t get it! Can you say that again?', 'I don\'t get it! Can you say that again?');
    }
};

exports.handler = function(event, context, callback){
    var alexa = Alexa.handler(event, context, callback);
    alexa.appId = APP_ID;
    alexa.registerHandlers(handlers);
    alexa.execute();
};


