// Required Libraries
const express = require("express");
const moment = require("moment");
const cron = require("node-cron");

// Define Constants
const WAIT_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const WHATSAPP_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
console.log("WAIT_TIMEOUT", WAIT_TIMEOUT);
// Express App Setup
const app = express();
app.use(express.json());

// Data Structures
const allEmails = [
  "test1@gmail.com,test2@gmail.com",
  "test3@gmail.com",
  "test4@gmail.com",
  "test5@gmail.com",
];
const journeys = {}; // Store journey configurations
const users = {}; // Store user states
const CRM_USERS = [];

// Define Classes and Functions
class Journey {
  constructor(name, blocks) {
    this.name = name;
    this.blocks = blocks;
  }

  processEvent(userId, event) {
    const user = users[userId];
    const block = user.currentBlock;

    if (!block) {
      console.error(`User ${userId} is not in any block.`);
      return;
    }

    // Check if event is valid for the current block
    if (!block.events.includes(event.type)) {
      console.error(
        `Event ${event.type} is not valid for block ${block.name}.`
      );
      return;
    }

    // Handle event based on block type
    switch (block.type) {
      case "action":
        this.processActionBlock(user, block, event);
        break;
      case "wait":
        this.processWaitBlock(user, block, event);
        break;
      default:
        console.error(`Unknown block type ${block.type}.`);
    }
  }

  processActionBlock(user, block, event) {
    // Execute actions and move to next block
    console.log(`Processing action block ${block.name} for user ${user.id}`);
    if (block.action === "email") {
      sendEmail(user.id, block.emailContent); // Send email to user
    } else if (block.action === "whatsapp") {
      sendWhatsApp(user.id, block.whatsappContent); // Send WhatsApp message to user
    } else if (block.action === "add_to_crm") {
      addToCRM(user.id); // Add user to CRM
    }
    user.currentBlock = this.blocks[block.next];
    // Update user state or perform other actions
    // Check if user response is "yes" and add to CRM
    if (event.type === "email_response" && event.response === "yes") {
      addToCRM(user.id); // Add user to CRM
    }
  }

  processWaitBlock(user, block, event) {
    // Check if event matches the expected event
    if (block.event === event.type && block.criteria(event)) {
      console.log(
        `User ${user.id} responded to event ${event.type} within timeout.`
      );
      this.processActionBlock(user, block, event);
    } else {
      // Check for timeout
      const elapsedTime = moment().diff(user.startTime);
      if (elapsedTime > WAIT_TIMEOUT) {
        console.log(`Timeout reached for user ${user.id}.`);
        // Handle timeout
        // For example, move user to the next block or exit journey
        user.currentBlock = this.blocks[block.nextOnTimeout];
        // Update user state or perform other actions
      } else if (
        elapsedTime > WHATSAPP_TIMEOUT &&
        block.action === "whatsapp"
      ) {
        console.log(`Sending WhatsApp reminder to user ${user.id}.`);
        sendWhatsApp(user.id, block.whatsappContent); // Send WhatsApp reminder message to user
      } else {
        console.log(
          `User ${user.id} is still waiting for event ${block.event}.`
        );
      }
    }
  }
}

class User {
  constructor(id, journeyName) {
    this.id = id;
    this.journeyName = journeyName;
    this.currentBlock = null;
    this.startTime = moment();
  }
}

// Simulated Functions to Send Email and WhatsApp Messages
function sendEmail(userId, content) {
  console.log(`Email sent to user ${userId}: ${content}`);
}

function sendWhatsApp(userId, content) {
  console.log(`WhatsApp message sent to user ${userId}: ${content}`);
}

function addToCRM(userId) {
  // Logic to add user to CRM
  CRM_USERS.push(userId);
  console.log(`Adding user ${userId} to CRM.`);
}

//Function to send emails to all users
function sendInitialEmailToAll() {
  allEmails.forEach((emailId) => {
    let emailContent = "Hello, this is a sample email content.";
    sendEmail(emailId, emailContent);
  });
}

// Function to handle cron job for email and WhatsApp actions
function handleActions() {
  console.log("Handling email and WhatsApp actions...");
  // Iterate through users and check for email and WhatsApp actions
  for (const userId in users) {
    const user = users[userId];
    const block = user.currentBlock;
    if (
      block &&
      block.type === "action" &&
      (block.action === "email" || block.action === "whatsapp")
    ) {
      const journey = journeys[user.journeyName];
      journey.processActionBlock(user, block, { type: "cron" });
    }
  }
}

// Function to handle cron job for WhatsApp reminders
function sendWhatsAppReminders() {
  console.log("Sending WhatsApp reminders...");
  // Iterate through users and check for users in wait block with WhatsApp action
  for (const userId in users) {
    const user = users[userId];
    const block = user.currentBlock;
    if (block && block.type === "wait" && block.action === "whatsapp") {
      const elapsedTime = moment().diff(user.startTime);
      if (elapsedTime > WHATSAPP_TIMEOUT) {
        console.log(`Sending WhatsApp reminder to user ${user.id}.`);
        sendWhatsApp(user.id, block.whatsappContent); // Send WhatsApp reminder message to user
      }
    }
  }
}

// API Endpoints
app.post("/journey", (req, res) => {
  //BELOW IS THE MOCK REQUEST BODY
  req.body = {
    name: "Sample_Journey",
    blocks: [
      {
        name: "Send Email",
        type: "action",
        events: ["email_sent"],
        action: "email",
        emailContent: "Hello, this is a sample email content.",
      },
      {
        name: "Wait for Email Response",
        type: "wait",
        events: ["email_response"],
        event: "email_response",
        criteria: {
          response: "yes",
        },
        next: 3,
        timeout: 86400, // 24 hours in seconds
      },
      {
        name: "Send WhatsApp Message",
        type: "action",
        events: [],
        action: "whatsapp",
        whatsappContent: "Hello, this is a sample WhatsApp message.",
      },
      {
        name: "Add to CRM",
        type: "action",
        events: [],
        action: "add_to_crm",
      },
    ],
  };

  const journeyConfig = req.body;
  const journey = new Journey(journeyConfig.name, journeyConfig.blocks);
  journeys[journeyConfig.name] = journey;
  res.json({
    status: true,
    message: "Journey created successfully.",
    journeys: journeys,
  });
});

app.post("/event/:journeyName/:userId", (req, res) => {
  //BELOW IS THE MOCK REQUEST BODY
  req.body = {
    type: "email_response",
    response: "yes",
  };
  const journeyName = req.params.journeyName;
  const userId = req.params.userId;
  const event = req.body;

  const journey = journeys[journeyName];
  if (!journey) {
    return res
      .status(404)
      .json({ status: false, message: "Journey not found." });
  }

  if (!users[userId]) {
    users[userId] = new User(userId, journeyName);
    users[userId].currentBlock = journey.blocks[0];
  }

  journey.processEvent(userId, event);
  res.json({ status: true, message: "Event processed successfully." });
});

app.get("/users", (req, res) => {
  if (Object.keys(users).length) {
    res.json({ status: true, data: users });
  } else {
    res.json({ status: false, message: "No User Found" });
  }
});
app.get("/CRM_USERS", (req, res) => {
  if (Object.keys(CRM_USERS).length) {
    res.json({ status: true, data: CRM_USERS });
  } else {
    res.json({ status: false, message: "No User Found" });
  }
});
app.get("/journeys", (req, res) => {
  if (Object.keys(journeys).length) {
    res.json({ status: true, data: journeys });
  } else {
    res.json({ status: false, message: "No Journey Found" });
  }
});
// Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Schedule cron jobs to run every minute
  cron.schedule("* * * * *", sendInitialEmailToAll);
  cron.schedule("* * * * *", handleActions);
  cron.schedule("* * * * *", sendWhatsAppReminders);
});

/**
 * API's created
 *
 * 1. When server gets started cron starts running triggering
 * a)Sending Email to All users
 * b)watching for adding users to CRM after email confirmation
 * c)watching inactive users and sending whatsapp reminders and adding users to CRM after whatsapp confirmation
 *
 * 2. Creating a journey
 * POST : http://localhost:3000/journey
 * 3. Sending an Event:
 * POST : http://localhost:3000/event/Sample_Journey/123
 * 4. Get all users
 * GET : http://localhost:3000/users
 * 5. Get all CRM users
 * GET : http://localhost:3000/CRM_USERS
 * 6. Get all journeys
 * GET : http://localhost:3000/journeys
 *
 */
