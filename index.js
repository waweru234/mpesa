const express = require("express");

const app = express();
app.use(express.json());

app.post("/mpesa/callback", (req, res) => {
    console.log("M-Pesa Callback:", req.body);

    res.json({
        ResultCode: 0,
        ResultDesc: "Accepted"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});