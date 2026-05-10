import express from "express";

const app = express();
app.use(express.json());

app.post("/mpesa/callback", (req, res) => {
    console.log("M-Pesa Callback:", req.body);

    res.json({
        ResultCode: 0,
        ResultDesc: "Accepted"
    });
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});