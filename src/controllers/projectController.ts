import { Request, Response } from "express";
import prisma from "../config/db";
import { ApiError, sendSuccess, sendError, slugify } from "../utils/helpers";

// Shape project for API response — parse JSON fields
function shapeProject(p: any) {
  return {
    ...p,
    tech: p.technologies ? p.technologies.map((t: any) => t.name || t) : [],
    highlights: parseJson(p.highlights),
    keywords: parseJson(p.keywords),
    availableLanguages: parseJson(p.availableLanguages),
    faqJson: parseJson(p.faqJson),
    howToSteps: parseJson(p.howToSteps),
    quote: p.quote && typeof p.quote === "string" ? tryParse(p.quote) : p.quote,
  };
}

function parseJson(val: any): any {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return val || [];
}

function tryParse(val: any): any {
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

export async function getProjects(req: Request, res: Response) {
  try {
    const category = req.query.category as string | undefined;
    const featured = req.query.featured as string | undefined;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (category && category !== "All") where.category = category;
    if (featured === "true") where.featured = true;

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: { technologies: true, metrics: true },
        orderBy: { order: "asc" },
        skip,
        take: limit,
      }),
      prisma.project.count({ where }),
    ]);

    sendSuccess(res, {
      projects: projects.map(shapeProject),
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function getProject(req: Request, res: Response) {
  try {
    const slug = req.params.slug as string;
    const id = req.params.id as string;

    const project = await prisma.project.findUnique({
      where: slug ? { slug } : { id },
      include: { technologies: true, metrics: true },
    });

    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    sendSuccess(res, shapeProject(project));
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function createProject(req: Request, res: Response) {
  try {
    const d = req.body;
    const techNames = d.technologies || d.tech || [];

    const project = await prisma.project.create({
      data: {
        slug: d.slug || slugify(d.title),
        title: d.title,
        subtitle: d.subtitle || "",
        category: d.category,
        description: d.description,
        role: d.role || "",
        problem: d.problem || "",
        approach: d.approach || "",
        outcome: d.outcome || "",
        year: d.year || "",
        gradient: d.gradient || "",
        demo: d.demo || null,
        github: d.github || null,
        image: d.image || null,
        featured: d.featured || false,
        order: d.order || 0,
        highlights: d.highlights || [],
        quote: d.quote || null,
        metaTitle: d.metaTitle || null,
        metaDescription: d.metaDescription || null,
        ogImage: d.ogImage || null,
        keywords: d.keywords || [],
        canonical: d.canonical || null,
        geoRegion: d.geoRegion || null,
        geoPlaceName: d.geoPlaceName || null,
        geoPosition: d.geoPosition || null,
        geoCountry: d.geoCountry || null,
        areaServed: d.areaServed || "Worldwide",
        availableLanguages: d.availableLanguages || ["en"],
        faqJson: d.faqJson || [],
        howToSteps: d.howToSteps || [],
        speakableText: d.speakableText || null,
        userId: d.userId || null,
        technologies: {
          create: techNames.map((name: string) => ({ name })),
        },
        metrics: {
          create: (d.metrics || []).map((m: any) => ({
            value: String(m.value),
            label: String(m.label),
          })),
        },
      },
      include: { technologies: true, metrics: true },
    });

    sendSuccess(res, shapeProject(project), 201);
  } catch (error) {
    console.error("[CREATE PROJECT ERROR]", error);
    sendError(res, error as Error);
  }
}

export async function updateProject(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const d = req.body;

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError(404, "Project not found");
    }

    const techNames = d.technologies || d.tech;
    const hasTechUpdate = techNames && Array.isArray(techNames);
    const hasMetricsUpdate = d.metrics && Array.isArray(d.metrics);

    // Delete old tech and metrics if being replaced
    if (hasTechUpdate || hasMetricsUpdate) {
      if (hasTechUpdate) await prisma.tech.deleteMany({ where: { projectId: id } });
      if (hasMetricsUpdate) await prisma.metric.deleteMany({ where: { projectId: id } });
    }

    const updateData: any = {
      ...(d.slug !== undefined && { slug: d.slug }),
      ...(d.title !== undefined && { title: d.title }),
      ...(d.subtitle !== undefined && { subtitle: d.subtitle }),
      ...(d.category !== undefined && { category: d.category }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.role !== undefined && { role: d.role }),
      ...(d.problem !== undefined && { problem: d.problem }),
      ...(d.approach !== undefined && { approach: d.approach }),
      ...(d.outcome !== undefined && { outcome: d.outcome }),
      ...(d.year !== undefined && { year: d.year }),
      ...(d.gradient !== undefined && { gradient: d.gradient }),
      ...(d.demo !== undefined && { demo: d.demo }),
      ...(d.github !== undefined && { github: d.github }),
      ...(d.image !== undefined && { image: d.image }),
      ...(d.featured !== undefined && { featured: d.featured }),
      ...(d.order !== undefined && { order: d.order }),
      ...(d.highlights !== undefined && { highlights: d.highlights }),
      ...(d.quote !== undefined && { quote: d.quote }),
      ...(d.metaTitle !== undefined && { metaTitle: d.metaTitle }),
      ...(d.metaDescription !== undefined && { metaDescription: d.metaDescription }),
      ...(d.ogImage !== undefined && { ogImage: d.ogImage }),
      ...(d.keywords !== undefined && { keywords: d.keywords }),
      ...(d.canonical !== undefined && { canonical: d.canonical }),
      ...(d.geoRegion !== undefined && { geoRegion: d.geoRegion }),
      ...(d.geoPlaceName !== undefined && { geoPlaceName: d.geoPlaceName }),
      ...(d.geoPosition !== undefined && { geoPosition: d.geoPosition }),
      ...(d.geoCountry !== undefined && { geoCountry: d.geoCountry }),
      ...(d.areaServed !== undefined && { areaServed: d.areaServed }),
      ...(d.availableLanguages !== undefined && { availableLanguages: d.availableLanguages }),
      ...(d.faqJson !== undefined && { faqJson: d.faqJson }),
      ...(d.howToSteps !== undefined && { howToSteps: d.howToSteps }),
      ...(d.speakableText !== undefined && { speakableText: d.speakableText }),
    };

    // Add nested creates for tech/metrics if provided
    if (hasTechUpdate) {
      updateData.technologies = { create: techNames.map((name: string) => ({ name })) };
    }
    if (hasMetricsUpdate) {
      updateData.metrics = { create: d.metrics.map((m: any) => ({ value: String(m.value), label: String(m.label) })) };
    }

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: { technologies: true, metrics: true },
    });

    sendSuccess(res, shapeProject(project));
  } catch (error) {
    sendError(res, error as Error);
  }
}

export async function deleteProject(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    await prisma.project.delete({ where: { id } });

    sendSuccess(res, { message: "Project deleted" });
  } catch (error) {
    sendError(res, error as Error);
  }
}
