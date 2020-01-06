"use strict";

const nodeMailin = require("../lib/node-mailin");
//const nodenodeMailin = require('node-nodeMailin');

/*give node access to ports below 1000 using followign command
 * INFO: use "sudo setcap 'cap_net_bind_service=+ep' `which node`"
 * to set required permission to node for using port 25
 */

const options = {
    port: 25,
    disableSpamScore: true,
    // logFile: "",
    logLevel: "debug", // One of silly, info, debug, warn, error
    smtpOptions: {
        banner: "Hi from a Node-nodeMailin!!!",
        disableDNSValidation: false
    }
};

nodeMailin.start(options);

/* Access simplesmtp server instance. */
nodeMailin.on("authorizeUser", function(connection, username, password, done) {
    if (username == "nodejs124" && password == "passy@1234") {
        done(null, true);
    } else {
        done(new Error("Unauthorized!"), false);
    }
});

/* Event emitted when the "From" address is received by the smtp server. */
nodeMailin.on('validateSender', async function(session, address, callback) {
    if (address == 'foo@bar.com') { /*blacklist a specific email adress*/
        err = new Error('You are blocked'); /*Will be the SMTP server response*/
        err.responseCode = 530; /*Will be the SMTP server return code sent back to sender*/
        callback(err);
    } else {
        callback()
    }
});

/* Event emitted when the "To" address is received by the smtp server. */
nodeMailin.on('validateRecipient', async function(session, address, callback) {
    console.log(address)
        /* Here you can validate the address and return an error 
         * if you want to reject it e.g: 
         *     err = new Error('Email address not found on server');
         *     err.responseCode = 550;
         *     callback(err);*/
    callback()
});

/* Event emitted when a connection with the nodeMailin smtp server is initiated. */
nodeMailin.on("startMessage", function(connection) {
    /* connection = {
        from: 'sender@gmail.com',
        to: 'someaddress@yahoo.com',
        id: 'hffj7656',
        authentication: { username: null, authenticated: false, status: 'NORMAL' }
      }
    }; */
    console.log(connection);
});

/* Event emitted after a message was received and parsed. */
nodeMailin.on("message", async(connection, data, content) => {
    console.log(data); //Object with all email data like html text
    // Use parsed message `data` directly or use raw message `content`. */
});

/* Event emitted on error. */
nodeMailin.on("error", async error => {
    console.log(error);
});