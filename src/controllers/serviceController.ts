import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET /api/services — public, returns all active services
export const getServices = async (req: Request, res: Response) => {
  try {
    const { category, featured, limit, sort, order } = req.query;

    const where: any = { active: true };
    if (category && category !== "All") where.category = category as string;
    if (featured === "true") where.featured = true;

    const orderBy: any = {};
    if (sort === "order") orderBy.order = order === "asc" ? "asc" : "desc";
    else if (sort === "title") orderBy.title = order === "asc" ? "asc" : "desc";
    else if (sort === "createdAt") orderBy.createdAt = order === "asc" ? "asc" : "desc";
    else orderBy.order = "asc";

    const take = limit ? parseInt(limit as string) : undefined;

    const [services, total] = await Promise.all([
      prisma.service.findMany({ where, orderBy, take }),
      prisma.service.count({ where }),
    ]);

    const shaped = services.map(shapeService);

    res.json({ success: true, data: { services: shaped, total } });
  } catch (error) {
    console.error("Get services error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch services" });
  }
};

// GET /api/services/slug/:slug — public, returns one service by slug
export const getServiceBySlug = async (req: Request, res: Response) => {
  try {
    const service = await prisma.service.findUnique({
      where: { slug: req.params.slug as string },
    });

    if (!service || !service.active) {
      return res.status(404).json({ success: false, error: "Service not found" });
    }

    res.json({ success: true, data: shapeService(service) });
  } catch (error) {
    console.error("Get service by slug error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch service" });
  }
};

// GET /api/services/:id — admin, returns one service by id
export const getService = async (req: Request, res: Response) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id as string },
    });

    if (!service) {
      return res.status(404).json({ success: false, error: "Service not found" });
    }

    res.json({ success: true, data: shapeService(service) });
  } catch (error) {
    console.error("Get service error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch service" });
  }
};

// POST /api/services — admin, create service
export const createService = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const existing = await prisma.service.findUnique({ where: { slug: data.slug } });
    if (existing) {
      return res.status(409).json({ success: false, error: "A service with this slug already exists" });
    }

    const service = await prisma.service.create({
      data: {
        slug: data.slug,
        icon: data.icon || "code",
        title: data.title,
        category: data.category,
        description: data.description,
        overview: data.overview,
        image: data.image || null,
        order: data.order ?? 0,
        featured: data.featured ?? false,
        active: data.active ?? true,
        deliverables: data.deliverables || [],
        stack: data.stack || [],
        bestFor: data.bestFor || [],
        features: data.features || [],
        metaTitle: data.metaTitle || null,
        metaDescription: data.metaDescription || null,
        ogImage: data.ogImage || null,
        keywords: data.keywords || [],
        canonical: data.canonical || null,
        geoRegion: data.geoRegion || null,
        geoPlaceName: data.geoPlaceName || null,
        geoPosition: data.geoPosition || null,
        geoCountry: data.geoCountry || null,
        areaServed: data.areaServed || "Worldwide",
        availableLanguages: data.availableLanguages || ["en"],
        faqJson: data.faqJson || [],
        howToSteps: data.howToSteps || [],
        speakableText: data.speakableText || null,
      },
    });

    res.status(201).json({ success: true, data: shapeService(service) });
  } catch (error) {
    console.error("Create service error:", error);
    res.status(500).json({ success: false, error: "Failed to create service" });
  }
};

// PUT /api/services/:id — admin, update service
export const updateService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const existing = await prisma.service.findUnique({ where: { id: id as string } });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Service not found" });
    }

    if (data.slug && data.slug !== existing.slug) {
      const slugTaken = await prisma.service.findUnique({ where: { slug: data.slug as string } });
      if (slugTaken) {
        return res.status(409).json({ success: false, error: "A service with this slug already exists" });
      }
    }

    const service = await prisma.service.update({
      where: { id: id as string },
      data: {
        slug: data.slug ?? existing.slug,
        icon: data.icon ?? existing.icon,
        title: data.title ?? existing.title,
        category: data.category ?? existing.category,
        description: data.description ?? existing.description,
        overview: data.overview ?? existing.overview,
        image: data.image ?? existing.image,
        order: data.order ?? existing.order,
        featured: data.featured ?? existing.featured,
        active: data.active ?? existing.active,
        deliverables: data.deliverables ?? existing.deliverables,
        stack: data.stack ?? existing.stack,
        bestFor: data.bestFor ?? existing.bestFor,
        features: data.features ?? existing.features,
        metaTitle: data.metaTitle ?? existing.metaTitle,
        metaDescription: data.metaDescription ?? existing.metaDescription,
        ogImage: data.ogImage ?? existing.ogImage,
        keywords: data.keywords ?? existing.keywords,
        canonical: data.canonical ?? existing.canonical,
        geoRegion: data.geoRegion ?? existing.geoRegion,
        geoPlaceName: data.geoPlaceName ?? existing.geoPlaceName,
        geoPosition: data.geoPosition ?? existing.geoPosition,
        geoCountry: data.geoCountry ?? existing.geoCountry,
        areaServed: data.areaServed ?? existing.areaServed,
        availableLanguages: data.availableLanguages ?? existing.availableLanguages,
        faqJson: data.faqJson ?? existing.faqJson,
        howToSteps: data.howToSteps ?? existing.howToSteps,
        speakableText: data.speakableText ?? existing.speakableText,
      },
    });

    res.json({ success: true, data: shapeService(service) });
  } catch (error) {
    console.error("Update service error:", error);
    res.status(500).json({ success: false, error: "Failed to update service" });
  }
};

// DELETE /api/services/:id — admin, delete service
export const deleteService = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.service.findUnique({ where: { id: id as string } });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Service not found" });
    }

    await prisma.service.delete({ where: { id: id as string } });
    res.json({ success: true, message: "Service deleted" });
  } catch (error) {
    console.error("Delete service error:", error);
    res.status(500).json({ success: false, error: "Failed to delete service" });
  }
};

// Shape service for API response — parse JSON fields
function shapeService(s: any) {
  return {
    ...s,
    deliverables: parseJson(s.deliverables),
    stack: parseJson(s.stack),
    bestFor: parseJson(s.bestFor),
    features: parseJson(s.features),
    keywords: parseJson(s.keywords),
    availableLanguages: parseJson(s.availableLanguages),
    faqJson: parseJson(s.faqJson),
    howToSteps: parseJson(s.howToSteps),
  };
}

function parseJson(val: any): any {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return val || [];
}
