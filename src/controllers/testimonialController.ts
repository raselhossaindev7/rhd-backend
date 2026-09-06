import { Request, Response } from "express";
import prisma from "../config/db";
import { clearCache } from "../middleware/cache";

// GET /api/testimonials — public, returns all active testimonials
export const getTestimonials = async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;

    const where = { active: true };
    const orderBy = { order: "asc" as const };
    // Cap page size so a single request can never dump the whole table
    const take = Math.min(limit ? parseInt(limit as string) || 50 : 50, 100);

    // Sequential reads (no $transaction): each query checks a pooled
    // connection out briefly and releases it. A $transaction batch pins
    // one server connection on the Supabase transaction-mode pooler for
    // the whole batch and is fragile there (10054 / "server closed the
    // connection"). Reads don't need transactional consistency.
    const testimonials = await prisma.testimonial.findMany({ where, orderBy, take });
    const total = await prisma.testimonial.count({ where });

    res.json({ success: true, data: { testimonials, total } });
  } catch (error) {
    console.error("Get testimonials error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch testimonials" });
  }
};

// GET /api/testimonials/:id — admin, returns one testimonial by id
export const getTestimonial = async (req: Request, res: Response) => {
  try {
    const testimonial = await prisma.testimonial.findUnique({
      where: { id: req.params.id as string },
    });

    if (!testimonial) {
      return res.status(404).json({ success: false, error: "Testimonial not found" });
    }

    res.json({ success: true, data: testimonial });
  } catch (error) {
    console.error("Get testimonial error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch testimonial" });
  }
};

// POST /api/testimonials — admin, create testimonial
export const createTestimonial = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const testimonial = await prisma.testimonial.create({
      data: {
        name: data.name,
        role: data.role,
        quote: data.quote,
        rating: data.rating ?? 5,
        image: data.image || null,
        order: data.order ?? 0,
        active: data.active ?? true,
      },
    });

    clearCache();
    res.status(201).json({ success: true, data: testimonial });
  } catch (error) {
    console.error("Create testimonial error:", error);
    res.status(500).json({ success: false, error: "Failed to create testimonial" });
  }
};

// PUT /api/testimonials/:id — admin, update testimonial
export const updateTestimonial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const existing = await prisma.testimonial.findUnique({ where: { id: id as string } });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Testimonial not found" });
    }

    const testimonial = await prisma.testimonial.update({
      where: { id: id as string },
      data: {
        name: data.name ?? existing.name,
        role: data.role ?? existing.role,
        quote: data.quote ?? existing.quote,
        rating: data.rating ?? existing.rating,
        image: data.image ?? existing.image,
        order: data.order ?? existing.order,
        active: data.active ?? existing.active,
      },
    });

    clearCache();
    res.json({ success: true, data: testimonial });
  } catch (error) {
    console.error("Update testimonial error:", error);
    res.status(500).json({ success: false, error: "Failed to update testimonial" });
  }
};

// DELETE /api/testimonials/:id — admin, delete testimonial
export const deleteTestimonial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.testimonial.findUnique({ where: { id: id as string } });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Testimonial not found" });
    }

    await prisma.testimonial.delete({ where: { id: id as string } });
    clearCache();
    res.json({ success: true, message: "Testimonial deleted" });
  } catch (error) {
    console.error("Delete testimonial error:", error);
    res.status(500).json({ success: false, error: "Failed to delete testimonial" });
  }
};
