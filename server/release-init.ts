import { db } from "./db.js";
import { releases, outputTemplates } from "../shared/schema.js";
import { eq } from "drizzle-orm";
import { log } from "./vite.js";

export async function ensureActiveReleaseHasTemplates(): Promise<void> {
  try {
    // Get the active release
    let [activeRelease] = await db
      .select()
      .from(releases)
      .where(eq(releases.isActive, true))
      .limit(1);

    if (!activeRelease) {
      // Create a default active release
      log("No active release found, creating default release", "release-init");
      
      // Get all output templates
      const allTemplates = await db.select().from(outputTemplates);
      const allTemplateIds = allTemplates.map(t => t.id);
      
      const newRelease = {
        id: crypto.randomUUID(),
        version: 1,
        label: 'Default Release',
        status: 'active',
        changeNotes: 'Auto-generated default release',
        systemPromptId: null,
        expertIds: [],
        templateIds: [],
        outputTemplateIds: allTemplateIds,
        toolPolicyIds: [],
        isActive: true,
        publishedAt: new Date(),
        publishedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      await db.insert(releases).values(newRelease);
      log(`Created default release with ${allTemplateIds.length} output templates`, "release-init");
      return;
    }

    // Get all output templates
    const allTemplates = await db.select().from(outputTemplates);
    
    if (allTemplates.length === 0) {
      log("No output templates found", "release-init");
      return;
    }

    // Get all template IDs
    const allTemplateIds = allTemplates.map(t => t.id);
    
    // Check if the active release already has all templates
    const currentTemplateIds = activeRelease.outputTemplateIds as string[] || [];
    const needsUpdate = allTemplateIds.some(id => !currentTemplateIds.includes(id));

    if (needsUpdate) {
      // Update the active release to include all template IDs
      await db
        .update(releases)
        .set({
          outputTemplateIds: allTemplateIds,
          updatedAt: new Date(),
        })
        .where(eq(releases.id, activeRelease.id));

      log(`Updated active release to include ${allTemplateIds.length} output templates`, "release-init");
    } else {
      log("Active release already has all templates", "release-init");
    }
  } catch (error) {
    // Don't fail startup if this fails
    log(`Failed to sync templates to active release: ${(error as Error).message}`, "release-init");
  }
}
