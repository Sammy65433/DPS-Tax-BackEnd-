import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import xlsx from "xlsx";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://dpstaxpro.com",
      "https://www.dpstaxpro.com",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", err => {
  console.error("Unhandled Rejection:", err);
});
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});


app.use(express.json());

console.log("SUPABASE_URL exists:", !!process.env.SUPABASE_URL);
console.log("SUPABASE_KEY exists:", !!process.env.SUPABASE_KEY);
console.log("RESEND_API_KEY exists:", !!process.env.RESEND_API_KEY);
console.log("PORT:", process.env.PORT);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);
const BASE_URL = process.env.BASE_URL || "http://localhost:5001";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function normalizeEmails(emails = []) {
  return [
    ...new Set(
      emails
        .map(email => String(email || "").trim().toLowerCase())
        .filter(email => email && email.includes("@"))
    ),
  ];
}

function buildEmailTemplate({
  first_name,
  service,
  tax_preparer,
  appointment_date,
  appointment_time,
  appointmentId,
}) {
  const confirmLink = `${BASE_URL}/api/appointments/${appointmentId}/confirm`;
  const cancelLink = `${BASE_URL}/api/appointments/${appointmentId}/cancel-from-email`;
  const rescheduleLink = `${FRONTEND_URL}/booking`;

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
      <h2 style="color: #0f5c54;">Appointment Request Received</h2>
      <p>Hello ${first_name},</p>
      <p>Thank you for booking with DPS Professional Tax Services.</p>
      <p><strong>Service:</strong> ${service}</p>
      <p><strong>Preparer:</strong> ${tax_preparer}</p>
      <p><strong>Date:</strong> ${appointment_date}</p>
      <p><strong>Time:</strong> ${appointment_time}</p>
      <p><strong>Phone:</strong> (973) 327-2340</p>
      <p><strong>Location:</strong> 1811 Springfield Ave, Maplewood, NJ 07040</p>
      <p>Please confirm, cancel, or reschedule your appointment using the buttons below:</p>
      <div style="margin: 20px 0;">
        <a href="${confirmLink}" style="display:inline-block; padding:12px 18px; margin-right:10px; background:#2ca79b; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold;">
          Confirm Appointment
        </a>
        <a href="${cancelLink}" style="display:inline-block; padding:12px 18px; margin-right:10px; background:#a12626; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold;">
          Cancel Appointment
        </a>
        <a href="${rescheduleLink}" style="display:inline-block; padding:12px 18px; background:#6f42a8; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold;">
          Reschedule Appointment
        </a>
      </div>
      <p>If you need to reschedule, you can use the button above or contact our office.</p>
      <p>Please do not reply with sensitive tax documents by email. Use our secure client portal for document uploads.</p>
      <p>Thank you,<br />DPS Professional Tax Services</p>
    </div>
  `;
}

function buildRealtyEmailTemplate({
  first_name,
  service,
  appointment_date,
  appointmentId,
}) {
  const confirmLink = `${BASE_URL}/api/realty-appointments/${appointmentId}/confirm`;
  const cancelLink = `${BASE_URL}/api/realty-appointments/${appointmentId}/cancel-from-email`;
  const rescheduleLink = `${FRONTEND_URL}/real-estate-booking`;

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
      <h2 style="color: #8a6a3f;">Realty Appointment Request Received</h2>
      <p>Hello ${first_name},</p>
      <p>Thank you for contacting DPS Realty.</p>
      <p><strong>Service:</strong> ${service}</p>
      <p><strong>Date:</strong> ${appointment_date || "Not provided"}</p>
      <p>Please confirm, cancel, or reschedule your request using the buttons below:</p>
      <div style="margin: 20px 0;">
        <a href="${confirmLink}" style="display:inline-block; padding:12px 18px; margin-right:10px; background:#2ca79b; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold;">
          Confirm Request
        </a>
        <a href="${cancelLink}" style="display:inline-block; padding:12px 18px; margin-right:10px; background:#a12626; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold;">
          Cancel Request
        </a>
        <a href="${rescheduleLink}" style="display:inline-block; padding:12px 18px; background:#6f42a8; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold;">
          Reschedule Request
        </a>
      </div>
      <p>We will contact you soon to follow up on your request.</p>
      <p>Thank you,<br />DPS Realty</p>
    </div>
  `;
}

async function sendAppointmentUpdateEmail(appointment) {
  try {
    const result = await resend.emails.send({
      from: "appointments@dpstaxpro.com",
      to: appointment.email,
      subject: "Your DPS Tax Appointment Has Been Updated",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
          <h2 style="color: #0f5c54;">Appointment Updated</h2>
          <p>Hello ${appointment.first_name},</p>
          <p>Your appointment has been updated.</p>
          <p><strong>Service:</strong> ${appointment.service}</p>
          <p><strong>Preparer:</strong> ${appointment.tax_preparer}</p>
          <p><strong>New Date:</strong> ${appointment.appointment_date}</p>
          <p><strong>New Time:</strong> ${appointment.appointment_time}</p>
          <p><strong>Phone:</strong> (973) 327-2340</p>
          <p><strong>Location:</strong> 1811 Springfield Ave, Maplewood, NJ 07040</p>
          <p>If you have any questions, please contact our office.</p>
          <p>Thank you,<br />DPS Professional Tax Services</p>
        </div>
      `,
    });

    console.log("Updated appointment email sent:", result);
  } catch (error) {
    console.error("Error sending updated appointment email:", error);
  }
}

async function sendRealtyUpdateEmail(appointment) {
  try {
    const result = await resend.emails.send({
      from: "appointments@dpstaxpro.com",
      to: appointment.email,
      subject: "Your DPS Realty Appointment Has Been Updated",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
          <h2 style="color: #8a6a3f;">Realty Appointment Updated</h2>
          <p>Hello ${appointment.first_name},</p>
          <p>Your realty appointment has been updated.</p>
          <p><strong>Service:</strong> ${appointment.service}</p>
          <p><strong>New Date:</strong> ${appointment.appointment_date || "Not provided"}</p>
          <p><strong>Phone:</strong> ${appointment.phone}</p>
          <p><strong>Location:</strong> 1811 Springfield Ave, Maplewood, NJ 07040</p>
          <p>If you have any questions, please contact our office.</p>
          <p>Thank you,<br />DPS Realty</p>
        </div>
      `,
    });

    console.log("Updated realty appointment email sent:", result);
  } catch (error) {
    console.error("Error sending updated realty appointment email:", error);
  }
}

app.get("/", (req, res) => {
  res.json({ message: "DPS Tax API is running" });
});

app.get("/api/appointments/availability", async (req, res) => {
  const { date, preparer } = req.query;

  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("appointment_time")
      .eq("appointment_date", date)
      .eq("tax_preparer", preparer)
      .in("status", ["booked", "confirmed"]);

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    const bookedTimes = [...new Set(data.map(item => item.appointment_time))];
    res.json({ bookedTimes });
  } catch (error) {
    console.error("Error fetching availability:", error);
    res.status(500).json({ message: "Error fetching availability." });
  }
});

app.get("/api/appointments", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ message: "Error fetching appointments." });
  }
});

app.post("/api/appointments", async (req, res) => {
  const {
    first_name,
    last_name,
    phone,
    email,
    service,
    tax_preparer,
    appointment_date,
    appointment_time,
    message,
  } = req.body;

  try {
    const { data: existingAppointments, error: existingError } = await supabase
      .from("appointments")
      .select("*")
      .eq("appointment_date", appointment_date)
      .eq("appointment_time", appointment_time)
      .eq("tax_preparer", tax_preparer)
      .in("status", ["booked", "confirmed"]);

    if (existingError) {
      return res.status(500).json({ message: existingError.message });
    }

    if (existingAppointments.length > 0) {
      return res.status(409).json({
        message: "That appointment slot is already booked.",
      });
    }

    const { data, error } = await supabase
      .from("appointments")
      .insert([
        {
          first_name,
          last_name,
          phone,
          email,
          service,
          tax_preparer,
          appointment_date,
          appointment_time,
          message,
          status: "booked",
        },
      ])
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    const newAppointment = data[0];

    try {
      const emailResult = await resend.emails.send({
        from: "appointments@dpstaxpro.com",
        to: email,
        subject: "Your DPS Tax Appointment Request",
        html: buildEmailTemplate({
          first_name,
          service,
          tax_preparer,
          appointment_date,
          appointment_time,
          appointmentId: newAppointment.id,
        }),
      });
      console.log("Tax email result:", emailResult);
    } catch (emailError) {
      console.error("Error sending tax confirmation email:", emailError);
    }

    try {
      await resend.emails.send({
        from: "appointments@dpstaxpro.com",
        to: "appointments@dpstaxpro.com",
        subject: "New DPS Tax Appointment Booked",
        html: `
          <h2>New Tax Appointment Booked</h2>
          <p><strong>Name:</strong> ${first_name} ${last_name}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Service:</strong> ${service}</p>
          <p><strong>Preparer:</strong> ${tax_preparer}</p>
          <p><strong>Date:</strong> ${appointment_date}</p>
          <p><strong>Time:</strong> ${appointment_time}</p>
          <p><strong>Message:</strong> ${message || "None"}</p>
        `,
      });
    } catch (officeEmailError) {
      console.error("Error sending office notification email:", officeEmailError);
    }

    res.status(201).json(newAppointment);
  } catch (error) {
    console.error("Error creating appointment:", error);
    res.status(500).json({ message: "Error creating appointment." });
  }
});

app.get("/api/appointments/:id/confirm", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).send("<h2>Error confirming appointment.</h2>");
    }

    if (!data || data.length === 0) {
      return res.status(404).send("<h2>Appointment not found.</h2>");
    }

    res.send(`
      <div style="font-family: Arial, sans-serif; padding: 30px;">
        <h2 style="color: #0f5c54;">Appointment Confirmed</h2>
        <p>Your appointment has been successfully confirmed.</p>
        <p>Thank you for choosing DPS Professional Tax Services.</p>
      </div>
    `);
  } catch (error) {
    console.error("Error confirming appointment:", error);
    res.status(500).send("<h2>Error confirming appointment.</h2>");
  }
});

app.get("/api/appointments/:id/cancel-from-email", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).send("<h2>Error cancelling appointment.</h2>");
    }

    if (!data || data.length === 0) {
      return res.status(404).send("<h2>Appointment not found.</h2>");
    }

    res.send(`
      <div style="font-family: Arial, sans-serif; padding: 30px;">
        <h2 style="color: #a12626;">Appointment Cancelled</h2>
        <p>Your appointment has been cancelled successfully.</p>
        <p>If you would like to reschedule, please contact DPS Professional Tax Services.</p>
      </div>
    `);
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    res.status(500).send("<h2>Error cancelling appointment.</h2>");
  }
});
app.patch("/api/appointments/:id/cancel", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    res.json({
      message: "Appointment cancelled successfully.",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    res.status(500).json({ message: "Error cancelling appointment." });
  }
});

app.patch("/api/appointments/:id/archive", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("appointments")
      .update({ status: "archived" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    res.json({
      message: "Appointment archived successfully.",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error archiving appointment:", error);
    res.status(500).json({ message: "Error archiving appointment." });
  }
});

app.patch("/api/appointments/:id", async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    last_name,
    phone,
    email,
    service,
    tax_preparer,
    appointment_date,
    appointment_time,
    message,
    status,
  } = req.body;

  try {
    const { data: currentAppointment, error: currentError } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", id)
      .single();

    if (currentError) {
      return res.status(500).json({ message: currentError.message });
    }

    if (!currentAppointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const oldDate = currentAppointment.appointment_date;
    const oldTime = currentAppointment.appointment_time;

    const { data: existingAppointments, error: existingError } = await supabase
      .from("appointments")
      .select("*")
      .eq("appointment_date", appointment_date)
      .eq("appointment_time", appointment_time)
      .eq("tax_preparer", tax_preparer)
      .in("status", ["booked", "confirmed"])
      .neq("id", id);

    if (existingError) {
      return res.status(500).json({ message: existingError.message });
    }

    if (existingAppointments.length > 0) {
      return res.status(409).json({
        message: "That appointment slot is already booked.",
      });
    }

    const { data, error } = await supabase
      .from("appointments")
      .update({
        first_name,
        last_name,
        phone,
        email,
        service,
        tax_preparer,
        appointment_date,
        appointment_time,
        message,
        status,
      })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    const updatedAppointment = data[0];

    if (
      String(oldDate) !== String(updatedAppointment.appointment_date) ||
      String(oldTime) !== String(updatedAppointment.appointment_time)
    ) {
      await sendAppointmentUpdateEmail(updatedAppointment);
    }

    res.json({
      message: "Appointment updated successfully.",
      appointment: updatedAppointment,
    });
  } catch (error) {
    console.error("Error updating appointment:", error);
    res.status(500).json({ message: "Error updating appointment." });
  }
});

app.delete("/api/appointments/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    res.json({
      message: "Appointment deleted successfully.",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error deleting appointment:", error);
    res.status(500).json({ message: "Error deleting appointment." });
  }
});

app.get("/api/realty-appointments", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("realty_appointments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error("Error fetching realty appointments:", error);
    res.status(500).json({ message: "Error fetching realty appointments." });
  }
});

app.post("/api/realty-appointments", async (req, res) => {
  const {
    first_name,
    last_name,
    phone,
    email,
    service,
    appointment_date,
    appointment_time,
    message,
  } = req.body;

  try {
    const { data, error } = await supabase
      .from("realty_appointments")
      .insert([
        {
          first_name,
          last_name,
          phone,
          email,
          service,
          appointment_date,
          appointment_time,
          message,
          status: "pending",
        },
      ])
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    const newRealtyAppointment = data[0];

    try {
      const emailResult = await resend.emails.send({
        from: "appointments@dpstaxpro.com",
        to: email,
        subject: "Your DPS Realty Appointment Request",
        html: buildRealtyEmailTemplate({
          first_name,
          service,
          appointment_date,
          appointmentId: newRealtyAppointment.id,
        }),
      });
      console.log("Realty email result:", emailResult);
    } catch (emailError) {
      console.error("Error sending realty confirmation email:", emailError);
    }

    try {
      await resend.emails.send({
        from: "appointments@dpstaxpro.com",
        to: "appointments@dpstaxpro.com",
        subject: "New DPS Realty Request",
        html: `
          <h2>New Realty Appointment Request</h2>
          <p><strong>Name:</strong> ${first_name} ${last_name}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Service:</strong> ${service}</p>
          <p><strong>Date:</strong> ${appointment_date || "Not provided"}</p>
          <p><strong>Message:</strong> ${message || "None"}</p>
        `,
      });
    } catch (officeEmailError) {
      console.error("Error sending office realty notification email:", officeEmailError);
    }

    res.status(201).json(newRealtyAppointment);
  } catch (error) {
    console.error("Error creating realty appointment:", error);
    res.status(500).json({ message: "Error creating realty appointment." });
  }
});

app.get("/api/realty-appointments/:id/confirm", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("realty_appointments")
      .update({ status: "confirmed" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).send("<h2>Error confirming realty request.</h2>");
    }

    if (!data || data.length === 0) {
      return res.status(404).send("<h2>Realty request not found.</h2>");
    }

    res.send(`
      <div style="font-family: Arial, sans-serif; padding: 30px;">
        <h2 style="color: #8a6a3f;">Realty Request Confirmed</h2>
        <p>Your realty request has been successfully confirmed.</p>
        <p>Thank you for choosing DPS Realty.</p>
      </div>
    `);
  } catch (error) {
    console.error("Error confirming realty request:", error);
    res.status(500).send("<h2>Error confirming realty request.</h2>");
  }
});

app.get("/api/realty-appointments/:id/cancel-from-email", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("realty_appointments")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).send("<h2>Error cancelling realty request.</h2>");
    }

    if (!data || data.length === 0) {
      return res.status(404).send("<h2>Realty request not found.</h2>");
    }

    res.send(`
      <div style="font-family: Arial, sans-serif; padding: 30px;">
        <h2 style="color: #a12626;">Realty Request Cancelled</h2>
        <p>Your realty request has been cancelled successfully.</p>
        <p>If you would like to reschedule, please contact DPS Realty.</p>
      </div>
    `);
  } catch (error) {
    console.error("Error cancelling realty request:", error);
    res.status(500).send("<h2>Error cancelling realty request.</h2>");
  }
});

app.patch("/api/realty-appointments/:id", async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    last_name,
    phone,
    email,
    service,
    appointment_date,
    appointment_time,
    message,
    status,
  } = req.body;

  try {
    const { data: currentAppointment, error: currentError } = await supabase
      .from("realty_appointments")
      .select("*")
      .eq("id", id)
      .single();

    if (currentError) {
      return res.status(500).json({ message: currentError.message });
    }

    if (!currentAppointment) {
      return res.status(404).json({ message: "Realty request not found." });
    }

    const oldDate = currentAppointment.appointment_date;
    const oldTime = currentAppointment.appointment_time;

    const { data, error } = await supabase
      .from("realty_appointments")
      .update({
        first_name,
        last_name,
        phone,
        email,
        service,
        appointment_date,
        appointment_time,
        message,
        status,
      })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Realty request not found." });
    }

    const updatedAppointment = data[0];

    if (
      String(oldDate) !== String(updatedAppointment.appointment_date) ||
      String(oldTime) !== String(updatedAppointment.appointment_time)
    ) {
      await sendRealtyUpdateEmail(updatedAppointment);
    }

    res.json({
      message: "Realty appointment updated successfully.",
      appointment: updatedAppointment,
    });
  } catch (error) {
    console.error("Error updating realty appointment:", error);
    res.status(500).json({ message: "Error updating realty appointment." });
  }
});


app.patch("/api/realty-appointments/:id/confirm", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("realty_appointments")
      .update({ status: "confirmed" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Realty request not found." });
    }

    res.json({
      message: "Realty request confirmed successfully.",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error confirming realty request:", error);
    res.status(500).json({ message: "Error confirming realty request." });
  }
});

app.patch("/api/realty-appointments/:id/cancel", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("realty_appointments")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Realty request not found." });
    }

    res.json({
      message: "Realty request cancelled successfully.",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error cancelling realty request:", error);
    res.status(500).json({ message: "Error cancelling realty request." });
  }
});

app.patch("/api/realty-appointments/:id/archive", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("realty_appointments")
      .update({ status: "archived" })
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Realty request not found." });
    }

    res.json({
      message: "Realty request archived successfully.",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error archiving realty request:", error);
    res.status(500).json({ message: "Error archiving realty request." });
  }
});

app.delete("/api/realty-appointments/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("realty_appointments")
      .delete()
      .eq("id", id)
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: "Realty request not found." });
    }

    res.json({
      message: "Realty request deleted successfully.",
      appointment: data[0],
    });
  } catch (error) {
    console.error("Error deleting realty request:", error);
    res.status(500).json({ message: "Error deleting realty request." });
  }
});

app.post("/api/send-client-bulk-email", async (req, res) => {
  const { emails, subject, html } = req.body;

  try {
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        message: "A list of recipient emails is required.",
      });
    }

    if (!subject || !html) {
      return res.status(400).json({
        message: "Subject and html are required.",
      });
    }

    const cleanedEmails = normalizeEmails(emails);

    if (cleanedEmails.length === 0) {
      return res.status(400).json({
        message: "No valid emails found.",
      });
    }

    const batches = chunkArray(cleanedEmails, 50);
    const results = [];

    for (const batch of batches) {
      for (const email of batch) {
        try {
          const result = await resend.emails.send({
            from: "appointments@dpstaxpro.com",
            to: email,
            subject,
            html,
          });

          results.push({
            email,
            success: true,
            id: result?.data?.id || null,
          });
        } catch (error) {
          results.push({
            email,
            success: false,
            error: error.message || "Unknown email error",
          });
        }
      }
    }

    const successCount = results.filter(item => item.success).length;
    const failedCount = results.filter(item => !item.success).length;

    res.json({
      message: "Bulk email sending completed.",
      totalRecipients: cleanedEmails.length,
      batches: batches.length,
      successCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error("Bulk email error:", error);
    res.status(500).json({ message: "Error sending bulk client emails." });
  }
});

app.get("/api/parse-client-emails", async (req, res) => {
  try {
    const workbook = xlsx.readFile("./public/DPS Client List.xls");
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = xlsx.utils.sheet_to_json(sheet, {
      range: 4,
      defval: "",
    });

    const emails = normalizeEmails(rows.map(row => row["Email"]));

    res.json({
      totalRows: rows.length,
      totalEmails: emails.length,
      emails,
    });
  } catch (error) {
    console.error("Parse spreadsheet error:", error);
    res.status(500).json({ message: "Error parsing spreadsheet." });
  }
});

const PORT = process.env.PORT || 5001;
console.log("Starting server...");
console.log("BASE_URL:", BASE_URL);
console.log("FRONTEND_URL:", FRONTEND_URL);



app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});





Good. The server is up. Now test the URL directly in a new tab:

- `https://dps-tax-backend-production.up.railway.app/`
- `https://dps-tax-backend-production.up.railway.app/health`

If that still fails while logs say online, it’s likely Railway networking/domain propagation for a minute. Refresh and retry in an incognito tab.

If `/health` works now, next:
- restore your real `server.js`
- redeploy
- test `/health` again before testing frontend

Important:
the minimal server proved Railway itself works. So any future failure is from your app code, not Railway.