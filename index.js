const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');       //for jwt//
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(`${process.env.STRIPE_KEY}`);
const nodemailer = require("nodemailer");    //nodemailer//
const mg = require('nodemailer-mailgun-transport');


const port = process.env.PORT || 5000;
const app = express();
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.shcob.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// verify jwt 
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access denied!' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

//mailgun
const auth = {
    auth: {
        api_key: process.env.SM_API,
        domain: process.env.SM_DOMAIN
    }
}
const nodemailerMailgun = nodemailer.createTransport(mg(auth));

// verify jwt 
async function run() {
    try {

        const eventCollections = client.db('EventCollection').collection('events');
        const userCollections = client.db('userCollection').collection('users');
        const professionalCollection = client.db('professionalCollection').collection('professional')
        const notificationCollections = client.db('notificationCollection').collection('eventNotifications');
        const packagesCollections = client.db('packagesCollection').collection('packages');



        //payment API
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: [
                    "card"
                ],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
            console.log(clientSecret)
        })


        // for jwt 
        app.get('/users', verifyJWT, async (req, res) => {
            const result = await userCollections.find().toArray();
            res.send(result);
        })

        app.post('/users', async (req, res) => {
            const users = req.body;
            const query = {
                userName: users.userName,
                userEmail: users.email
            }
            const results = await userCollections.insertOne(query);
            res.send(results);
        })

        // make admin 
        app.put('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requestAccount = await userCollections.findOne({ email: requester });
            if (requestAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollections.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'Forbidden access!' });
            }
        })

        // remove admin 
        app.put('/users/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requestAccount = await userCollections.findOne({ email: requester });
            if (requestAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: '' },
                };
                const result = await userCollections.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'Forbidden access!' });
            }
        })

        // packages 
        // get packages 
        app.get('/packages', async (req, res) => {
            const result = await packagesCollections.find().toArray()
            // console.log(result);
            res.send(result);
        })

        //get package with id
        app.get('/packages/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await packagesCollections.findOne(query);
            res.send(result);
        })

        //update package
        app.put('/packages/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const query = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    name: data.naem,
                    price: data.price,
                    activeEvent: data.activeEvent,
                    calender: data.calender,
                    groupEvent: data.groupEvent,
                    notificationStatus: data.notificationStatus,
                    oneToOne: data.oneToOne,
                    accessType: data.accessType
                },
            };
            const result = await packagesCollections.updateOne(query, updateDoc, options);
            res.send(result);
        })


        //admin check
        app.get('/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollections.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        //professional check
        app.get('/professional/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollections.findOne({ email: email });
            const isProfessional = user.status === 'professional';
            res.send({ professional: isProfessional });
        })

        //give professional status
        app.put('/users/professional/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { status: 'professional' },
            };
            const result = await userCollections.updateOne(filter, updateDoc);
            res.send(result);
        })

        //professional API
        app.post('/users/professional', async (req, res) => {
            const query = req.body;
            const result = await professionalCollection.insertOne(query);
            res.send(result);
        })

        //

        app.get('/professional', async (req, res) => {
            const result = await professionalCollection.find().toArray();
            res.send(result);
        })

        //delete
        // Deleting the order
        app.delete("/professional/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = professionalCollection.deleteOne(query);
            res.send(result);
        });

        //user update
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollections.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '30d' })
            res.send({ result, token });
        })
        // for jwt 

        app.get('/events', async (req, res) => {
            const result = await eventCollections.find().toArray();

            //trigger notification before 30 min of exact time and date
            result.map(r => {
                const time = moment(r.dateTime)
                const thirtyMinBeforeEvent = moment(time).subtract(30, 'm').toString();
                schedule.scheduleJob('eventNotification', thirtyMinBeforeEvent, async () => {
                    if (moment(time).subtract(30, 'm').isAfter(moment())) {
                        const query = {
                            eventNotification: `Your ${r.eventName} is after 30 min.`
                        }
                        const notificationResult = await notificationCollections.insertOne(query);
                    }
                })
            })
            res.send(result)
        })

        app.post('/events', async (req, res) => {
            const query = req.body;
            const results = await eventCollections.insertOne(query);
            res.send(results);
        })

        //get events with host
        app.get('/event', async (req, res) => {
            const host = req.query.host;
            const query = { host };
            const result = await eventCollections.find(query).toArray()
            res.send(result);
        })

        app.delete('/event/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await eventCollections.deleteOne(query);
            res.send(result);
        })

        app.put('/event/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const query = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    eventName: data.eventName,
                    eventType: data.event,
                    description: data.description,
                    dateTime: data.dateTime
                },
            };
            const result = await eventCollections.updateOne(query, updateDoc, options);
            res.send(result);
        })


        app.get('/notifications', async (req, res) => {
            const result = await notificationCollections.find().toArray();
            res.send(result);
        })

    } finally {

    }
}
run().catch(console.dir)

//maigun

const sendUserEmail = () => {
    const email = {
        from: "support@phero.com",
        to: 'neamulhaque2002@gmail.com',
        subject: `Your Appointment for ${"treatment"} is on ${"date"} at ${"slot"} is Confirmed`,
        text: `Your Appointment for ${"treatment"} is on ${"date"} at ${"slot"} is Confirmed`,
        html: `
          <div>
            <p> Hello ${"patientName"}, </p>
            <h3>Your Appointment for ${"treatment"} is confirmed</h3>
            <p>Looking forward to seeing you on ${"date"} at ${"slot"}.</p>
            <h3>Our Address</h3>
            <p>Andor Killa Bandorban</p>
            <p>Bangladesh</p>
            <a href="https://web.programming-hero.com/">unsubscribe</a>
          </div>
        `,
    };
    nodemailerMailgun.sendMail(email, (err, info) => {
        if (err) {
            console.log(err);
        } else {
            console.log(info);
        }
    });
}


app.get('/email', async (req, res) => {
    await sendUserEmail();
    res.send({ status: true })
})

app.get('/', (req, res) => {
    res.send('Breeze Time Server Running')
});

app.listen(port, () => {
    console.log('Listening the port', port)
})