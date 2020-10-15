// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.
const Alexa = require('ask-sdk-core');
const persistence = require('./persistence');
const interceptors = require('./interceptors');
const logic = require('./logic');
const constants = require('./constants');

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const {attributesManager, serviceClientFactory, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();

        const day = sessionAttributes['day'];
        const month = sessionAttributes['month']; //MM
        const monthName = sessionAttributes['monthName'];
        const year = sessionAttributes['year'];

        if(!sessionAttributes['name']){
            // let's try to get the given name via the Customer Profile API
            // don't forget to enable this permission in your skill configuratiuon (Build tab -> Permissions)
            // or you'll get a SessionEndedRequest with an ERROR of type INVALID_RESPONSE
            try {
                const {permissions} = requestEnvelope.context.System.user;
                if(!permissions)
                    throw { statusCode: 401, message: 'No permissions available' }; // there are zero permissions, no point in intializing the API
                const upsServiceClient = serviceClientFactory.getUpsServiceClient();
                const profileName = await upsServiceClient.getProfileGivenName();
                if (profileName) { // the user might not have set the name
                  //save to session and persisten attributes
                  sessionAttributes['name'] = profileName;
                }

            } catch (error) {
                console.log(JSON.stringify(error));
                if (error.statusCode === 401 || error.statusCode === 403) {
                  // the user needs to enable the permissions for given name, let's send a silent permissions card.
                  handlerInput.responseBuilder.withAskForPermissionsConsentCard(constants.GIVEN_NAME_PERMISSION);
                }
            }
        }

        const name = sessionAttributes['name'] ? sessionAttributes['name'] + '. ' : '';
        
        //Si no hay fecha guardada da la bienvenida y pide la fecha de nacimiento
        let speechText = handlerInput.t('WELCOME_MSG', {name: name});

        //estas líneas solo recuerdan el día del cumpleaños que tiene guardado, nada más
        /*if(day && monthName && year){
            speechText = handlerInput.t('REGISTER_MSG', {name: name, day: day, month: monthName, year: year}) + handlerInput.t('HELP_MSG');
        }*/
        
        //Pero si sí que hay una fecha, lo que quiero es que directamente me diga feliz cumpleaños
        if(day && month && year){
            const deviceId = requestEnvelope.context.System.device.deviceId;
    
            // let's try to get the timezone via the UPS API
            // (no permissions required but it might not be set up)
            let timezone;
            try {
                const upsServiceClient = serviceClientFactory.getUpsServiceClient();
                timezone = await upsServiceClient.getSystemTimeZone(deviceId);
            } catch (error) {
                return handlerInput.responseBuilder
                    .speak(handlerInput.t('NO_TIMEZONE_MSG'))
                    .getResponse();
            }
            console.log('Got timezone: ' + timezone);

            const birthdayData = logic.getBirthdayData(day, month, year, timezone);
            if(birthdayData.daysUntilBirthday === 0) { // it's the user's birthday!
                speechText = handlerInput.t('GREET_MSG', {name: name});
                speechText += handlerInput.t('NOW_TURN_MSG', {count: birthdayData.age});

                const dateData = logic.getAdjustedDateData(timezone);
                const response = await logic.fetchBirthdaysData(dateData.day, dateData.month, 5);

                if(response) { // if the API call fails we just don't append today's birthdays
                    console.log(JSON.stringify(response));
                    const results = response.results.bindings;
                    speechText += handlerInput.t('ALSO_TODAY_MSG');
                    results.forEach((person, index) => {
                        console.log(person);
                        if(index === Object.keys(results).length - 2)
                            speechText += person.humanLabel.value + handlerInput.t('CONJUNCTION_MSG');
                     
                        else
                            speechText += person.humanLabel.value + '. '
                    });
                }
            }
        
        return handlerInput.responseBuilder
            .speak(speechText + handlerInput.t('HELP_MSG'))
            .reprompt(handlerInput.t('HELP_MSG'))
            .getResponse();
        }
    }
};

const RegisterBirthdayIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'RegisterBirthdayIntent';
    },
    handle(handlerInput) {
        const {attributesManager, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        const {intent} = requestEnvelope.request;

        const day = intent.slots.day.value;
        const month = intent.slots.month.resolutions.resolutionsPerAuthority[0].values[0].value.id; //MM
        const monthName = intent.slots.month.resolutions.resolutionsPerAuthority[0].values[0].value.name;
        const year = intent.slots.year.value;
        
        sessionAttributes['day'] = day;
        sessionAttributes['month'] = month; 
        sessionAttributes['monthName'] = monthName;
        sessionAttributes['year'] = year;
        const name = sessionAttributes['name'] ? sessionAttributes['name'] + '. ' : '';

        const speechText = handlerInput.t('REGISTER_MSG', {name: name, day: day, month: monthName, year: year}) + handlerInput.t('HELP_MSG');

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(handlerInput.t('HELP_MSG'))
            .getResponse();
    }
};

const SayBirthdayIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'SayBirthdayIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        const day = sessionAttributes['day'];
        const month = sessionAttributes['month']; //MM
        const year = sessionAttributes['year'];
        const name = sessionAttributes['name'] ? sessionAttributes['name'] + '. ' : '';
        
        let speechText;
        if(day && month && year){
            const {requestEnvelope, serviceClientFactory} = handlerInput;
            const deviceId = requestEnvelope.context.System.device.deviceId;
    
            // let's try to get the timezone via the UPS API
            // (no permissions required but it might not be set up)
            let timezone;
            try {
                const upsServiceClient = serviceClientFactory.getUpsServiceClient();
                timezone = await upsServiceClient.getSystemTimeZone(deviceId);
            } catch (error) {
                return handlerInput.responseBuilder
                    .speak(handlerInput.t('NO_TIMEZONE_MSG'))
                    .getResponse();
            }
            console.log('Got timezone: ' + timezone);

            const birthdayData = logic.getBirthdayData(day, month, year, timezone);
            speechText = handlerInput.t('DAYS_LEFT_MSG', {name: name, count: birthdayData.daysUntilBirthday});
            speechText += handlerInput.t('WILL_TURN_MSG', {count: birthdayData.age + 1});
            if(birthdayData.daysUntilBirthday === 0) { // it's the user's birthday!
                speechText = handlerInput.t('GREET_MSG', {name: name});
                speechText += handlerInput.t('NOW_TURN_MSG', {count: birthdayData.age});

                const dateData = logic.getAdjustedDateData(timezone);
                const response = await logic.fetchBirthdaysData(dateData.day, dateData.month, 5);

                if(response) { // if the API call fails we just don't append today's birthdays
                    console.log(JSON.stringify(response));
                    const results = response.results.bindings;
                    speechText += handlerInput.t('ALSO_TODAY_MSG');
                    results.forEach((person, index) => {
                        console.log(person);
                        if(index === Object.keys(results).length - 2)
                            speechText += person.humanLabel.value + handlerInput.t('CONJUNCTION_MSG');
                        else
                            speechText += person.humanLabel.value + '. '
                    });
                }
            }
            speechText += handlerInput.t('OVERWRITE_MSG');
        } else {
            speechText = handlerInput.t('MISSING_MSG');
        }

        return handlerInput.responseBuilder
            .speak(speechText + handlerInput.t('HELP_MSG'))
            .reprompt(handlerInput.t('HELP_MSG'))
            .getResponse();
    }
};

const RemindBirthdayIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'RemindBirthdayIntent';
    },
    async handle(handlerInput) {
        const {attributesManager, serviceClientFactory, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        const {intent} = handlerInput.requestEnvelope.request;

        const day = sessionAttributes['day'];
        const month = sessionAttributes['month'];
        const year = sessionAttributes['year'];
        const name = sessionAttributes['name'] ? sessionAttributes['name'] : '';
        const message = intent.slots.message.value;

        if(intent.slots.message.confirmationStatus !== 'CONFIRMED') {

            return handlerInput.responseBuilder
                .speak(handlerInput.t('CANCEL_MSG') + handlerInput.t('HELP_MSG'))
                .reprompt(handlerInput.t('HELP_MSG'))
                .getResponse();
        }
        
        let speechText;
        if(day && month && year){
            const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
            // let's try to get the timezone via the UPS API
            // (no permissions required but it might not be set up)
            let timezone;
            try {
                const upsServiceClient = serviceClientFactory.getUpsServiceClient();
                timezone = await upsServiceClient.getSystemTimeZone(deviceId);
            } catch (error) {
                return handlerInput.responseBuilder
                    .speak(handlerInput.t('NO_TIMEZONE_MSG'))
                    .getResponse();
            }
            console.log('Got timezone: ' + timezone);

            const birthdayData = logic.getBirthdayData(day, month, year, timezone);

            // let's try to create a reminder via the Reminders API
            // don't forget to enable this permission in your skill configuratiuon (Build tab -> Permissions)
            // or you'll get a SessionEnndedRequest with an ERROR of type INVALID_RESPONSE
            try {
                const {permissions} = requestEnvelope.context.System.user;
                if(!permissions)
                    throw { statusCode: 401, message: 'No permissions available' }; // there are zero permissions, no point in intializing the API
                const reminderServiceClient = serviceClientFactory.getReminderManagementServiceClient();
                // reminders are retained for 3 days after they 'remind' the customer before being deleted
                const remindersList = await reminderServiceClient.getReminders();
                console.log('Recordatorios Actuales: ' + JSON.stringify(remindersList));
                console.log(JSON.stringify(remindersList));
                // delete previous reminder if present
                const previousReminder = sessionAttributes['reminderId'];
                if(previousReminder){
                    await reminderServiceClient.deleteReminder(previousReminder);
                    delete sessionAttributes['reminderId'];
                    console.log('Borrado recordatorio anterior con token: ' + previousReminder);
                }
                // create reminder structure
                const reminder = logic.createReminderData(
                    birthdayData.daysUntilBirthday,
                    timezone,
                    requestEnvelope.request.locale,
                    message); 
                const reminderResponse = await reminderServiceClient.createReminder(reminder); // the response will include an "alertToken" which you can use to refer to this reminder
                // save reminder id in session attributes
                sessionAttributes['reminderId'] = reminderResponse.alertToken;
                console.log('Recordatorio creado con token: ' + reminderResponse.alertToken);
                speechText = handlerInput.t('REMINDER_CREATED_MSG') + handlerInput.t('HELP_MSG');
            } catch (error) {
                console.log(JSON.stringify(error));
                switch (error.statusCode) {
                    case 401: // the user has to enable the permissions for reminders, let's attach a permissions card to the response
                        handlerInput.responseBuilder.withAskForPermissionsConsentCard(constants.REMINDERS_PERMISSION);
                        speechText = handlerInput.t('MISSING_PERMISSION_MSG') + handlerInput.t('HELP_MSG');
                        break;
                    case 403: // devices such as the simulator do not support reminder management
                        speechText = handlerInput.t('UNSUPPORTED_DEVICE_MSG') + handlerInput.t('HELP_MSG');
                        break;
                    default:
                        speechText = handlerInput.t('REMINDER_ERROR_MSG') + handlerInput.t('HELP_MSG');
                }
            }
        } else {
            speechText = handlerInput.t('MISSING_MSG') + handlerInput.t('HELP_MSG');
        }
        
        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(handlerInput.t('HELP_MSG'))
            .getResponse();
    }
};

const CelebrityBirthdaysIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'CelebrityBirthdaysIntent';
    },
    async handle(handlerInput) {
        const {attributesManager} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        
        const name = sessionAttributes['name'] ? sessionAttributes['name'] : '';

        const {requestEnvelope, serviceClientFactory} = handlerInput;
        const deviceId = requestEnvelope.context.System.device.deviceId;

        // let's try to get the timezone via the UPS API
        // (no permissions required but it might not be set up)
        let timezone;
        try {
            const upsServiceClient = serviceClientFactory.getUpsServiceClient();
            timezone = await upsServiceClient.getSystemTimeZone(deviceId);
        } catch (error) {
            return handlerInput.responseBuilder
                .speak(handlerInput.t('NO_TIMEZONE_MSG'))
                .getResponse();
        }
        console.log('Obtenido timezone: ' + timezone);

        try {
            // call the progressive response service
            await logic.callDirectiveService(handlerInput, handlerInput.t('PROGRESSIVE_MSG'));
          } catch (error) {
            // if it fails we can continue, but the user will wait without progressive response
            console.log("Progressive directive error : " + error);
        }

        const dateData = logic.getAdjustedDateData(timezone);
        const response = await logic.fetchBirthdaysData(dateData.day, dateData.month, 5); //fetch 5 entries

        let speechText = handlerInput.t('API_ERROR_MSG');
        if(response) {
            console.log(JSON.stringify(response));
            const results = response.results.bindings;
            speechText = handlerInput.t('CELEBRITY_BIRTHDAYS_MSG');
            results.forEach((person, index) => {
                console.log(person);
                if(index === Object.keys(results).length - 2)
                    speechText += person.humanLabel.value + handlerInput.t('CONJUNCTION_MSG');
                else
                    speechText += person.humanLabel.value + '. '
            });
        }
        speechText += handlerInput.t('HELP_MSG');

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(handlerInput.t('HELP_MSG'))
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speechText = handlerInput.t('HELP_MSG_LONG');

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'
                || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const name = sessionAttributes['name'] ? sessionAttributes['name'] : '';

        const speechText = handlerInput.t('GOODBYE_MSG', {name: name});

        return handlerInput.responseBuilder
            .speak(speechText)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speechText = handlerInput.t('FALLBACK_MSG');

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(handlerInput.t('HELP_MSG_LONG'))
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = handlerInput.requestEnvelope.request.intent.name;
        const speechText = handlerInput.t('REFLECTOR_MSG', {intent: intentName});

        return handlerInput.responseBuilder
            .speak(speechText)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speechText = handlerInput.t('ERROR_MSG');

        console.log(`~~~~ Error handled: ${error.message}`);

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(handlerInput.t('HELP_MSG_LONG'))
            .getResponse();
    }
};

// This handler acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        RegisterBirthdayIntentHandler,
        SayBirthdayIntentHandler,
        RemindBirthdayIntentHandler,
        CelebrityBirthdaysIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler) // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    .addErrorHandlers(
        ErrorHandler)
    .addRequestInterceptors(
        interceptors.LocalisationRequestInterceptor,
        interceptors.LoggingRequestInterceptor,
        interceptors.LoadAttributesRequestInterceptor)
    .addResponseInterceptors(
        interceptors.LoggingResponseInterceptor,
        interceptors.SaveAttributesResponseInterceptor)
    .withPersistenceAdapter(persistence.getPersistenceAdapter())
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();