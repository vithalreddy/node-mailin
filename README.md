# Node-Mailin

**Artisanal inbound emails for every web app**
<img align="right" src="postman.jpg"/>

Node-Mailin is an smtp server that listens for emails, parses as json.
It checks the incoming emails [dkim](http://en.wikipedia.org/wiki/DomainKeys_Identified_Mail), [spf](http://en.wikipedia.org/wiki/Sender_Policy_Framework), spam score (using [spamassassin](http://spamassassin.apache.org/)) and tells you in which language the email is written.

Node-Mailin can be used as a standalone application directly from the command line, or embedded inside a node application.

### Initial setup

#### Dependencies

Node-Mailin can run without any dependencies other than node itself, but having them allow you to use some additional features.

So first make sure the node is available, and the `node` command as well. On Debian/Ubuntu boxes:

```
sudo aptitude install nodejs ; sudo ln -s $(which nodejs) /usr/bin/node
```

To handle the spam score computation, Node-Mailin depends on spamassassin and its server interface spamc. Both should be available as packages on your machine. For instance on Debian/Ubuntu boxes:

Spamassassin is not enabled by default, enable it in with update-rc.d spamassassin enable command.

```bash
sudo aptitude install spamassassin spamc
sudo update-rc.d spamassassin enable
sudo service spamassassin start
```


#### Node versions

Current LTS and LTS+ versions.

#### The crux: setting up your DNS correctly

In order to receive emails, your smtp server address should be made available somewhere. Two records should be added to your DNS records. Let us pretend that we want to receive emails at `*@subdomain.domain.com`:

- First an MX record: `subdomain.domain.com MX 10 mxsubdomain.domain.com`. This means that the mail server for addresses like `*@subdomain.domain.com` will be `mxsubdomain.domain.com`.
- Then an A record: `mxsubdomain.domain.com A the.ip.address.of.your.Node-Mailin.server`. This tells at which ip address the mail server can be found.

You can fire up Node-Mailin (see next section) and use an [smtp server tester](http://mxtoolbox.com/diagnostic.aspx) to verify that everything is correct.

### Using Node-Mailin

#### From the command line

Install Node-Mailin globally.

```
sudo npm install -g node-mailin
```

Run it, (addtionnal help can be found using `node-mailin --help`). By default, Node-Mailin will listen on port 25, the standard smtp port. you can change this port for testing purpose using the `--port` option. However, do not change this port if you want to receive emails from the real world.

Ports number under 1000 are reserved to root user. So two options here. Either run Node-Mailin as root:

```
sudo node-mailin --port 25
```

Or, prefered choice, use something like `authbind` to run Node-Mailin with a standard user while still using port 25.
Here comes a [tutorial on how to setup authbind](http://respectthecode.tumblr.com/post/16461876216/using-authbind-to-run-node-js-on-port-80-with-dreamhost). In this case, do something like:

```
authbind --deep node-mailin --port 25
```

and make sure that your user can write to the log file.

At this point, Node-Mailin will listen for incoming emails, parse them, Then you can store them wherever you want.

##### Gotchas

- `error: listen EACCES`: your user do not have sufficients privileges to run on the given port. Ports under 1000 are restricted to root user. Try with [sudo](http://xkcd.com/149/).
- `error: listen EADDRINUSE`: the current port is already used by something. Most likely, you are trying to use port 25 and your machine's [mail transport agent](http://en.wikipedia.org/wiki/Message_transfer_agent) is already running. Stop it with something like `sudo service exim4 stop` or `sudo service postfix stop` before using Node-Mailin.
- `error: Unable to compute spam score ECONNREFUSED`: it is likely that spamassassin is not enabled on your machine, check the `/etc/default/spamassassin` file.
- `node: command not found`: most likely, your system does not have node installed or it is installed with a different name. For instance on Debian/Ubuntu, the node interpreter is called nodejs. The quick fix is making a symlink: `ln -s $(which nodejs) /usr/bin/node` to make the node command available.
- `Uncaught SenderError: Mail from command failed - 450 4.1.8 <an@email.address>: Sender address rejected: Domain not found`: The smtpOption `disableDNSValidation` is set to `false` and an email was sent from an invalid domain.

#### Embedded inside a node application

Install node-mailin locally.

```
sudo npm install --save node-mailin
```

Start the node-mailin server and listen to events.

```javascript
const nodeMailin = require("node-mailin");

/* Start the Node-Mailin server. The available options are:
 *  options = {
 *     port: 25,
 *     logFile: '/some/local/path',
 *     logLevel: 'warn', // One of silly, info, debug, warn, error
 *     smtpOptions: { // Set of options directly passed to simplesmtp.createServer(smtpOptions)
 *        SMTPBanner: 'Hi from a custom Node-Mailin instance',
 *        // By default, the DNS validation of the sender and recipient domains is disabled so.
 *        // You can enable it as follows:
 *        disableDNSValidation: false
 *     }
 *  };
 * parsed message. */
nodeMailin.start({
  port: 25
});

/* Access simplesmtp server instance. */
nodeMailin.on("authorizeUser", function(connection, username, password, done) {
  if (username == "johnsmith" && password == "mysecret") {
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

/* Event emitted when a connection with the Node-Mailin smtp server is initiated. */
nodeMailin.on("startMessage", function(connection) {
  /* connection = {
      from: 'sender@somedomain.com',
      to: 'someaddress@yourdomain.com',
      id: 't84h5ugf',
      authentication: { username: null, authenticated: false, status: 'NORMAL' }
    }
  }; */
  console.log(connection);
});

/* Event emitted after a message was received and parsed. */
nodeMailin.on("message", function(connection, data, content) {
  console.log(data);
  /* Do something useful with the parsed message here.
   * Use parsed message `data` directly or use raw message `content`. */
});

nodeMailin.on("error", function(error) {
  console.log(error);
});
```

##### Rejecting an incoming email

You can reject an incoming email when the **validateRecipient** or **validateSender** event gets called and you run the callback with an error (Can be anything you want, preferably an [actual SMTP server return code](https://en.wikipedia.org/wiki/List_of_SMTP_server_return_codes))
```JavaScript
nodeMailin.on('validateSender', async function(session, address, callback) {
    if (address == 'foo@bar.com') {         /*blacklist a specific email adress*/
        err = new Error('Email address was blacklisted'); /*Will be the SMTP server response*/
        err.responseCode = 530;             /*Will be the SMTP server return code sent back to sender*/
        callback(err);                      /*Run callback with error to reject the email*/
    } else {
        callback()                          /*Run callback to go to next step*/
    }
});
```


##### Events

- **startData** _(connection)_ - DATA stream is opened by the client.
- **data** _(connection, chunk)_ - E-mail data chunk is passed from the client.
- **dataReady** _(connection, callback)_ - Client has finished passing e-mail data. `callback` returns the queue id to the client.
- **authorizeUser** _(connection, username, password, callback)_ - Emitted if `requireAuthentication` option is set to true. `callback` has two parameters _(err, success)_ where `success` is a Boolean and should be true, if user is authenticated successfully.
- **validateSender** _(connection, email, callback)_ - Emitted if `validateSender` listener is set up.
- **senderValidationFailed** _(connection, email, callback)_ - Emitted if a sender DNS validation failed.
- **validateRecipient** _(connection, email, callback)_ - Emitted if `validateRecipients` listener is set up.
- **recipientValidationFailed** _(connection, email, callback)_ - Emitted if a recipient DNS validation failed.
- **close** _(connection)_ - Emitted when the connection to a client is closed.
- **startMessage** _(connection)_ - Connection with the Node-Mailin smtp server is initiated.
- **message** _(connection, data, content)_ - Message was received and parsed.
- **error** _(error)_ - And Error Occured.

### Todo

webhooks.

Docs: [StackFame Tech Blog](https://stackfame.com/receive-inbound-emails-node-js)

### Credits

- Postman image copyright [Charlie Allen](http://charlieallensblog.blogspot.fr).
- Heavily Inspired by mailin NPM Module.
