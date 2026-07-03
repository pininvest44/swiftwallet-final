const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// In-memory logs for simplicity (Resets when server restarts)
let executionLogs = [];

app.get('/', (req, res) => {
    res.render('index', { logs: executionLogs });
});

app.get('/api/logs', (req, res) => {
    res.json(executionLogs);
});

app.post('/initiate-bulk', async (req, res) => {
    const { phone_numbers, amount, reference, customer_name } = req.body;
    
    // Parse text area lines into an array of cleaned numbers
    const numbersArray = phone_numbers
        .split('\n')
        .map(num => num.trim())
        .filter(num => num.length > 0);

    if (numbersArray.length === 0) {
        return res.status(400).send("No valid phone numbers provided.");
    }

    // Acknowledge request immediately so UI doesn't hang
    res.redirect('/');

    // Process queue asynchronously
    processBulkQueue(numbersArray, { amount, reference, customer_name });
});

async function processBulkQueue(numbers, metadata) {
    const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds delay = Max 30 requests per minute

    for (let i = 0; i < numbers.length; i++) {
        const phone = numbers[i];
        const logEntry = {
            timestamp: new Date().toLocaleTimeString(),
            phone: phone,
            status: 'Processing...',
            details: ''
        };
        
        executionLogs.unshift(logEntry); // Push to the top of logs

        try {
            const response = await axios.post(
                process.env.API_URL || "http://localhost/pay-app/v3/stk-initiate/",
                {
                    amount: Number(metadata.amount),
                    phone_number: phone,
                    channel_id: Number(process.env.CHANNEL_ID || 123),
                    external_reference: `${metadata.reference}-${Date.now()}`, // uniqueness
                    customer_name: metadata.customer_name || "Bulk User",
                    callback_url: process.env.CALLBACK_URL
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.API_KEY}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            logEntry.status = 'Success';
            logEntry.details = JSON.stringify(response.data);
        } catch (error) {
            logEntry.status = 'Failed';
            logEntry.details = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        }

        // Wait 2 seconds before executing the next item (unless it's the last item)
        if (i < numbers.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
        }
    }
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
