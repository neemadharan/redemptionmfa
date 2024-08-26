const express = require('express');
const bodyParser = require('body-parser');
const app = express();

const { Vonage } = require('@vonage/server-sdk')

const vonage = new Vonage({
  apiKey: process.env.VON_APP_KEY,
  apiSecret: process.env.VON_APP_SEC
})

var scheme='http'
var port = process.env.PORT;
var SERVER  = 'localhost';

const isHeroku = process.env.ISHEROKU;
if(isHeroku == '1') {
     scheme='https'
     SERVER  = 'redemptionmfa-3997a988ac22.herokuapp.com';
}


app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

let inMemoryDB = {};


// Serve the index page
app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/views/register.html');
});

// Serve the redemption page
app.get('/redeem', (req, res) => {
    res.sendFile(__dirname + '/views/redemption.html');
});

// Register API - stores card number and phone number
app.post('/api/register', (req, res) => {
    const { cardNumber, phoneNumber } = req.body;
    if (!cardNumber || !phoneNumber) {
        return res.status(400).send("Card number and phone number are required.");
    }
    inMemoryDB[cardNumber] = { cardNumber, phoneNumber, code: null, validated: false };
    inMemoryDB[phoneNumber] = { cardNumber, phoneNumber, code: null, validated: false };

    res.status(200).send("Card and phone number registered.");
});

// ValidateCard API - generates a unique code and sends SMS (mock)
app.post('/api/validatecard', async (req, res) => {

    // inMemoryDB['1234'] = { cardNumber:"1234", phoneNumber: "5108071349", code: null, validated: false };
    // inMemoryDB['5108071349'] = { cardNumber:"1234", phoneNumber: "5108071349", code: null, validated: false };

    const { cardNumber } = req.body;
    if (!inMemoryDB[cardNumber]) {
        return res.status(400).send("Card number not registered.");
    }
    const uniqueCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    var ph = inMemoryDB[cardNumber].phoneNumber;
    inMemoryDB[ph].code = uniqueCode;
    inMemoryDB[cardNumber].validated = false;
    inMemoryDB[cardNumber].shouldWait = true;

     // Wait for the user to validate the code
    try {
        await sendSMS(inMemoryDB[cardNumber].phoneNumber, uniqueCode);
        console.log(`SMS sent to ${inMemoryDB[cardNumber].phoneNumber}: Your code is ${uniqueCode}`);

        await waitForValidation(cardNumber);
        if(inMemoryDB[cardNumber].validated) res.status(200).send("Code validated successfully.");
        else res.status(200).send("Code validated failed.");
    } catch (error) {
        console.log(error);
        res.status(400).send("Code validation failed or timed out.");
    }
});

// ValidateCode API - validates the code against the phone number
app.post('/api/validatecode', (req, res) => {
    const { phoneNumber, code } = req.body;
    var cn = inMemoryDB[phoneNumber].cardNumber;
    
    inMemoryDB[cn].shouldWait = false;
    if (!inMemoryDB[phoneNumber] || inMemoryDB[phoneNumber].code !== code) {
        inMemoryDB[cn].validated = false;
        res.status(404).send("Invalid phone number or code");
    } else {
        inMemoryDB[cn].validated = true;
        res.status(200).send("Code validated");
    }
    
});

// Function to wait for the code to be validated
function waitForValidation(cardNumber) {
    return new Promise((resolve, reject) => {
        const checkInterval = 1000; // Check every 1 second
        const timeout = 600000; // Timeout after 10 mins

        let elapsed = 0;

        const interval = setInterval(() => {
            elapsed += checkInterval;


            if (!inMemoryDB[cardNumber].shouldWait) {
                clearInterval(interval);
                resolve(true);
            }   else if (elapsed >= timeout) {
                clearInterval(interval);
                reject(new Error('Validation timed out.'));
            }
        }, checkInterval);
    });
}

// Function to send SMS via email using Nodemailer
async function sendSMS(phoneNumber, code) {
    const from = "16162829547"
    const to = `1${phoneNumber}`
    const text = `${scheme}://${SERVER}/redeem?code=${code}&j=`

    console.log(text);

    await vonage.sms.send({to, from, text})
    .then(resp => { console.log('Message sent successfully'); console.log(resp); })
    .catch(err => { console.log('There was an error sending the messages.'); console.error(err); });
}

// Start the server
app.listen(port, () => {
    console.log(`Server running on ${scheme}://${SERVER}:${port}`);
});
