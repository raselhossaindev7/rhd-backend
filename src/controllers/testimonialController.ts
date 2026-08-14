import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET /api/testimonials — public, returns all active testimonials
export const getTestimonials = async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;

    const where = { active: true };
    const orderBy = { order: "asc" as const };
    const take = limit ? parseInt(limit as string) : undefined;

    const [testimonials, total] = await Promise.all([
      prisma.testimonial.findMany({ where, orderBy, take }),
      prisma.testimonial.count({ where }),
    ]);

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
    res.json({ success: true, message: "Testimonial deleted" });
  } catch (error) {
    console.error("Delete testimonial error:", error);
    res.status(500).json({ success: false, error: "Failed to delete testimonial" });
  }
};
