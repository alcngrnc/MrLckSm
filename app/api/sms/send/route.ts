import { NextResponse } from "next/server";

type SmsBody = {
  to?: string;
  message?: string;
};

export async function POST(req: Request) {
  try {
    const secret = req.headers.get("x-ai-secret");

    if (secret !== process.env.AI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SmsBody;

    if (!body.to || !body.message) {
      return NextResponse.json(
        { error: "to and message are required" },
        { status: 400 }
      );
    }

    if (process.env.SMS_ENABLED !== "true") {
      console.log("SMS_DISABLED", {
        to: body.to,
        message: body.message,
      });

      return NextResponse.json({
  success: true,
  notification_status: "sms_disabled",
  message: "SMS sending is disabled in this environment.",
});
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json(
        { error: "Twilio environment variables are missing" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: body.to,
          Body: body.message,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.message || "Twilio SMS failed", details: result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mode: "twilio",
      sid: result.sid,
    });
  } catch (error) {
    console.error("SMS_SEND_ERROR", error);

    return NextResponse.json(
      { error: "Failed to send SMS" },
      { status: 500 }
    );
  }
}