const http = require('http');

const data = JSON.stringify({
    firstName: "Test",
    lastName: "User",
    email: "test.user@local.ai",
    department: "Quality Assurance"
});

const options = {
    hostname: 'localhost',
    port: 5003,
    path: '/api/teachers',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let responseBody = '';
    res.on('data', (chunk) => responseBody += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${responseBody}`);
        process.exit(0);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
    process.exit(1);
});

req.write(data);
req.end();
