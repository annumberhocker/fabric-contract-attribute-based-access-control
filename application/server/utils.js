'use strict';

// Bring key classes into scope, most importantly Fabric SDK network class
const fs = require('fs');
const path = require('path');
const { FileSystemWallet, Gateway, User, X509WalletMixin } = require('fabric-network');
const PubNub = require('pubnub')
const FabricCAServices = require('fabric-ca-client');


//  global variables for HLFabric
var gateway;
var configdata;
var network;
var wallet;
var bLocalHost;
var ccp;
var orgMSPID;
const EVENT_TYPE = "bcpocevent";  //  HLFabric EVENT

const SUCCESS = 0;

//  connectionOptions
var contract;

const utils = {};

// Main program function
utils.connectGatewayFromConfig = async () => {
    console.log("*********************** connectGatewayFromConfig function: ********************* ");

    // A gateway defines the peers used to access Fabric networks
    gateway = new Gateway();

    // Main try/catch block
    try {

        // Read configuration file which gives
        //  1.  connection profile - that defines the blockchain network and the endpoints for its CA, Peers
        //  2.  network name
        //  3.  channel name
        //  4.  wallet - collection of certificates
        //  5.  username - identity to be used for performing transactions

        const platform = process.env.PLATFORM || 'LOCAL';
        if (platform == 'IBP') {
            configdata = JSON.parse(fs.readFileSync('../../gateway/ibp/config.json', 'utf8'));
            console.log("Platform = " + platform);
            bLocalHost = false;
        } else { // PLATFORM = LOCAL
            configdata = JSON.parse(fs.readFileSync('../../gateway/local/config.json', 'utf8'));
            console.log("Platform = " + platform);
            bLocalHost = true;
        }

        const walletpath = configdata["wallet"];
        console.log("walletpath = " + walletpath);

        // Parse the connection profile. This would be the path to the file downloaded
        // from the IBM Blockchain Platform operational console.
        const ccpPath = path.resolve(__dirname, configdata["connection_profile_filename"]);
        const user = process.env.FABRIC_USER_ID || "admin";
        const pwd = process.env.FABRIC_USER_SECRET || "adminpw";
        const usertype = process.env.FABRIC_USER_TYPE || "admin";
        console.log('user: ' + user + ", pwd: ", pwd);

        // Load connection profile; will be used to locate a gateway
        ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Set up the MSP Id
        orgMSPID = ccp.client.organization;
        console.log('MSP ID: ' + orgMSPID);

        // Open path to the identity wallet
        wallet = new FileSystemWallet(walletpath);

        // user enroll and import if identity not found in wallet
        const idExists = await wallet.exists(user);
        if (!idExists) {
            // Enroll identity in the wallet
            console.log(`Enrolling and importing ${user} into wallet`);
            await utils.enrollUser(user, pwd, usertype)
        }

        // Connect to gateway using application specified parameters
        console.log('Connect to Fabric gateway.');
        await gateway.connect(ccp, {
            identity: user, wallet: wallet, discovery: { enabled: true, asLocalhost: bLocalHost }
        });

        // Access channel: channel_name
        console.log('Use network channel: ' + configdata["channel_name"]);

        // Get addressability to the smart contract as specified in config
        network = await gateway.getNetwork(configdata["channel_name"]);
        console.log('Use ' + configdata["smart_contract_name"] + ' smart contract.');
        contract = await network.getContract(configdata["smart_contract_name"]);
        return contract;

    } catch (error) {

        console.log(`Error processing transaction. ${error}`);
        console.log(error.stack);

    } finally {
    }
}

utils.events = async () => {
    //console.log("*********************** From events function: ********************* ");
    // get an eventhub once the fabric client has a user assigned. The user
    // is required because the event registration must be signed

    //  Eventhub is attached to a peer.  Get the peer, to register an event hub.
    //  client -> channel -> peer -> eventHub

    const client = gateway.getClient();
    var channel = client.getChannel(configdata["channel_name"]);
    var peers = channel.getChannelPeers();
    if (peers.length == 0) {
        console.log("\nError after call to channel.getChannelPeers(): Channel has no peers !\n")
    }

    console.log("Connecting to event hub..." + peers[0].getName());
    //  Assuming that we want to connect to the first peer in the peers list
    var channel_event_hub = channel.getChannelEventHub(peers[0].getName());

    channel_event_hub.connect(true);

    //**************************************************************** */
    // using resolve the promise so that result status may be processed
    // under the then clause rather than having the catch clause process
    // the status
    let event_monitor = new Promise((resolve, reject) => {
        /*  Sample usage of registerChaincodeEvent
        registerChaincodeEvent ('chaincodename', 'regularExpressionForEventName',
               callbackfunction(...) => {...},
               callbackFunctionForErrorHandling (...) => {...},
               // options:
               {startBlock:23, endBlock:30, unregister: true, disconnect: true}
        */
        var regid = channel_event_hub.registerChaincodeEvent(configdata["smart_contract_name"], EVENT_TYPE,
            (event, block_num, txnid, status) => {
                // This callback will be called when there is a chaincode event name
                // within a block that will match on the second parameter in the registration
                // from the chaincode with the ID of the first parameter.

                let event_payload = JSON.parse(event.payload.toString());

                console.log("\n\n------------- from HLFabric-----------------------\n");
                console.log("Event payload: " + event.payload.toString());
                console.log("\n\n------------------------------------\n");
                publishMessage("Blockchain Event: ", event_payload.event_type, bcChannelName);

                // to see the event payload, use 'true' in the call to channel_event_hub.connect(boolean)
                console.log("\n\nEvent payload: " + event.payload.toString());

                // parse the event and relay it onto pubnub channel for UI updates
                utils.parseAndRelay(event.payload.toString());
            }, (err) => {
                // this is the callback if something goes wrong with the event registration or processing
                reject(new Error('There was a problem with the eventhub in registerTxEvent ::' + err));
            },
            { disconnect: false } //continue to listen and not disconnect when complete
        );
    }, (err) => {

        console.log("  At creation of event_monitor: Error:" + err.toString());
        throw (err);

    });

    Promise.all([event_monitor]);
}  //  end of events()

//  events - pubnub
utils.parseAndRelay = (event) => {

    //  Parse the JSON data to a javascript object
    var eventData = JSON.parse(event);
    switch (eventData.event_type) {
        case "createOrder":
            publishMessage("blockchain event: ", "New Order Created - orderId: " + eventData.orderId, bcChannelName); break;
        default:
            publishMessage("blockchain event: ", eventData.event_type, bcChannelName); break;
    }
}

//  Util
utils.shipId = () => {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
    return `${s4()}${s4()}${s4()}${s4()}`
}

//  function registerUser
//  Purpose: Utility function for registering users with HL Fabric CA.
//  See POST api for details
utils.registerUser = async (userid, pwd, usertype) => {
    console.log("\n------------  function registerUser ---------------");
    console.log("\n userid: " + userid + ", pwd: " + pwd + ", usertype: " + usertype)

    const gateway = new Gateway();

    // Connect to gateway as admin
    await gateway.connect(ccp, { wallet, identity: 'admin', discovery: { enabled: false, asLocalhost: bLocalHost } });

    const orgs = ccp.organizations;
    const CAs = ccp.certificateAuthorities;
    const fabricCAKey = orgs[orgMSPID].certificateAuthorities[0];
    const caURL = CAs[fabricCAKey].url;
    const ca = new FabricCAServices(caURL, { trustedRoots: [], verify: false });

    var newUserDetails = {
        enrollmentID: userid,
        enrollmentSecret: pwd,
        role: "client",
        //affiliation: orgMSPID,
        //profile: 'tls',
        attrs: [
            {
                "name": "role",
                "value": usertype,
                "ecert": true
            }],
        maxEnrollments: 5
    };

    //  Register is done using admin signing authority
    ca.register(newUserDetails, gateway.getCurrentIdentity())
        .then(newPwd => {
            //  if a password was set in 'enrollmentSecret' field of newUserDetails,
            //  the same password is returned by "register".
            //  if a password was not set in 'enrollmentSecret' field of newUserDetails,
            //  then a generated password is returned by "register".
            console.log("\n---------------------------------------------------");
            console.log('\n Secret returned: ' + newPwd);
            console.log("\n---------------------------------------------------");

            return newPwd;
        }, error => {
            console.log("\n----------------------------------------");
            console.log('Error in register();  ERROR returned: ' + error);
            console.log("\n----------------------------------------");
            return error;
        });
}  //  end of function registerUser

utils.enrollUser = async (userid, pwd, usertype) => {
    console.log("\n------------  function enrollUser -----------------");
    console.log("\n userid: " + userid + ", pwd: " + pwd + ", role:" + usertype);

    // get certification authority
    console.log('Getting CA');
    const orgs = ccp.organizations;
    const CAs = ccp.certificateAuthorities;
    const fabricCAKey = orgs[orgMSPID].certificateAuthorities[0];
    const caURL = CAs[fabricCAKey].url;
    const ca = new FabricCAServices(caURL, { trustedRoots: [], verify: false });

    var newUserDetails = {
        enrollmentID: userid,
        enrollmentSecret: pwd,
        attrs: [
            {
                "name": "role", // application role
                "value": usertype,  // is Regulator
                "ecert": true
            }]
    };

    console.log("User Details: " + JSON.stringify(newUserDetails))
    return ca.enroll(newUserDetails).then(enrollment => {
        console.log("\n Successful enrollment; Data returned by enroll", enrollment.certificate);

        var identity = X509WalletMixin.createIdentity(orgMSPID, enrollment.certificate, enrollment.key.toBytes());

        wallet.import(userid, identity).then(notused => {
            let result = 'msg: Successfully enrolled user, ' + userid + ' and imported into the wallet';
            console.log(result);
            return result;
        }, error => {
            console.log("error in wallet.import\n" + error);
            throw error;
        });
    }, error => {
        console.log("Error in enrollment " + error.toString());
        throw error;
    });
}

utils.isUserEnrolled = async(userid) => {
    console.log("\n---------------  function isUserEnrolled ------------------------------------");
    console.log("\n userid: " + userid);
    console.log("\n---------------------------------------------------");

    return wallet.exists(userid).then(result => {
        console.log("is User Enrolled: " + result);
        console.log("\n---------------  end of function isUserEnrolled ------------------------------------");
        return result;
    }, error => {
        console.log("error in wallet.exists\n" + error);
        throw error;
    });
}

//  function setUserContext
//  Purpose:    to set the context to the user (who called this api) so that ACLs can be applied 
//              for that user inside chaincode. All subsequent calls using that gateway / contract 
//              will be on this user's behalf.
//  Input:      userid - which has been registered and enrolled earlier (so that certificates are
//              available in the wallet)
//  Output:     no explicit output;  (Global variable) contract will be set to this user's context

utils.setUserContext = async (userid, pwd) => {
    console.log('In function: setUserContext ....');

    // It is possible that the user has been registered and enrolled in Fabric CA earlier
    // and the certificates (in the wallet) could have been removed.  
    // Note that this case is not handled here.

    // Verify if user is already enrolled
    const userExists = await wallet.exists(userid);
    if (!userExists) {
        console.log("An identity for the user: " + userid + " does not exist in the wallet");
        console.log('Enroll user before retrying');
        throw ("Identity does not exist for userid: " + userid);
    }

    try {
        // Connect to gateway using application specified parameters
        console.log('Connect to Fabric gateway with userid:' + userid);
        let userGateway = new Gateway();
        await userGateway.connect(ccp, { identity: userid, wallet: wallet, discovery: { enabled: true, asLocalhost: bLocalHost } });

        // Access channel: channel_name
        console.log('Use network channel: ' + configdata["channel_name"]);
        network = await userGateway.getNetwork(configdata["channel_name"]);

        // Get addressability to the smart contract as specified in config
        contract = await network.getContract(configdata["smart_contract_name"]);
        console.log('Userid: ' + userid + ' connected to smartcontract: ' + 
                    configdata["smart_contract_name"] + ' in channel: ' + configdata["channel_name"]);

        console.log('Leaving setUserContext: ' + userid);
        return SUCCESS;
    }
    catch (error) { throw (error); }
}  //  end of UserContext(userid)

//  function getAllUsers
//  Purpose: get all enrolled users
utils.getAllUsers = async () => {
    const gateway = new Gateway();

    // Connect to gateway as admin
    await gateway.connect(ccp, { wallet, identity: 'admin', discovery: { enabled: false, asLocalhost: bLocalHost } });
    let client = gateway.getClient();
    let fabric_ca_client = client.getCertificateAuthority();
    let idService = fabric_ca_client.newIdentityService();
    let user = gateway.getCurrentIdentity();
    let userList = await idService.getAll(user);
    let identities = userList.result.identities;
    let result = [];
    let tmp;

    for (var i = 0; i < identities.length; i++) {
        tmp = {};
        tmp.id = identities[i].id;
        tmp.role = await utils.getUserRole(identities[i]);
        result.push(tmp);
    }

    return result;
}  //  end of function getAllUsers

utils.getUserRole = async (identity) => {
    var attr = identity.attrs;
    if (identity.id == "admin")
        return "admin";

    for (var i = 0; i < attr.length; i++) {
        if (attr[i].name == "role")
            return attr[i].value;
    }
    return "";
}

//  global variables for pubnub
var pubnubChannelName = "priceWatchChannel-gen";

utils.pubnubSetup = () => {
    var pubnub = new PubNub({
        publishKey: "pub-c-736b3de9-095f-4e98-8734-d6a36c6715a6",
        subscribeKey: "sub-c-8402da08-6ab9-11e9-81d5-56c3556875f9"
});

    pubnub.addListener({
        status: function (statusEvent) {
            if (statusEvent.category === "PNConnectedCategory") {
                utils.publishMessage("Initialized:", "From pubnub !", pubnubChannelName);
            }
        },
        message: function (msg) {
            console.log("-----------  pubnub -----------------");
            console.log("msg = ", msg);
            console.log("-------------------------------------");
        },
        presence: function (presenceEvent) {
            // handle presence
        }
    })

    return pubnub;
}

utils.getFormattedTime = (timetoken) => {
    var d = new Date(timetoken / 10000);
    return d.toLocaleString();
}

utils.publishMessage = (title, message, channelName) => {
    var publishConfig = {
        channel: channelName,
        message: {
            title: title,
            description: message
        },
        triggerEvents: true
    }

    pubnub.publish(publishConfig, function (status, response) {
        console.log("Last message published at " + getFormattedTime(response.timetoken));
    })
}

module.exports = utils;