const express = require("express");
const fetch = require("node-fetch"); // npm install node-fetch
const cors = require("cors");

const app = express();
app.use(cors());

app.get("/api/navchart", async (req, res) => {
  const FUND_ID = "ea6b13b2-f1e1-460a-904f-29a8747521da";
  const days = req.query.days || 30;

  try {
    const response = await fetch(
      `https://beta-restapi.sarmaaya.pk/api/mutual-funds/nav-history/${FUND_ID}?days=${days}`,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) throw new Error(`API returned status ${response.status}`);

    const json = await response.json();
    const formatted = (json.data || []).map((item) => ({
      date: item.date,
      nav: parseFloat(item.nav),
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(5000, () => console.log("Backend running on http://localhost:5000"));
