import { CollaborationFieldRepository } from '../repository/CollaborationFieldRepository';
import { CollaborationRecordRepository } from '../repository/CollaborationRecordRepository';
import {
  CollaborationFieldDef,
  CollaborationFieldType,
  CollaborationListType,
  CollaborationRecord,
  CollaborationStage,
} from '../types';

// Starter columns seeded the first time each list is opened. Fully editable/deletable
// afterward — these exist only so a blank list isn't a blank slate.
const DEFAULT_FIELDS: Record<CollaborationListType, Array<{ label: string; type: CollaborationFieldType; options?: string[]; required?: boolean }>> = {
  followup: [
    { label: 'Name', type: 'text', required: true },
    { label: 'Platform', type: 'dropdown', options: ['Instagram', 'YouTube', 'X', 'Other'] },
    { label: 'Handle / Profile', type: 'text' },
    { label: 'Phone Number', type: 'phone' },
    { label: 'Status', type: 'dropdown', options: ['New', 'Contacted', 'Negotiating', 'Interested', 'Not Interested'] },
    { label: 'Next Follow-up Date', type: 'date' },
    { label: 'Notes', type: 'textarea' },
  ],
  live: [
    { label: 'Name', type: 'text', required: true },
    { label: 'Collaboration Type', type: 'dropdown', options: ['Influencer', 'Affiliate'] },
    { label: 'Platform', type: 'dropdown', options: ['Instagram', 'YouTube', 'X', 'Multiple'] },
    { label: 'Followers / Subscribers', type: 'number' },
    { label: 'Phone Number', type: 'phone' },
    { label: 'Deal Terms', type: 'textarea' },
    { label: 'Payout Amount', type: 'number' },
    { label: 'Start Date', type: 'date' },
    { label: 'Status', type: 'dropdown', options: ['Active', 'Paused', 'Ended'] },
    { label: 'Notes', type: 'textarea' },
  ],
};

const VALID_LIST_TYPES: CollaborationListType[] = ['followup', 'live'];
const VALID_FIELD_TYPES: CollaborationFieldType[] = ['text', 'number', 'date', 'dropdown', 'checkbox', 'textarea', 'phone'];

function slugify(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'field';
}

export class CollaborationService {
  private fieldRepo = new CollaborationFieldRepository();
  private recordRepo = new CollaborationRecordRepository();

  isValidListType(listType: string): listType is CollaborationListType {
    return VALID_LIST_TYPES.includes(listType as CollaborationListType);
  }

  isValidStage(stage: string): stage is CollaborationStage {
    return VALID_LIST_TYPES.includes(stage as CollaborationStage);
  }

  isValidFieldType(type: string): type is CollaborationFieldType {
    return VALID_FIELD_TYPES.includes(type as CollaborationFieldType);
  }

  async getFields(listType: CollaborationListType): Promise<CollaborationFieldDef[]> {
    const existing = await this.fieldRepo.listByType(listType);
    if (existing.length > 0) return existing;

    const now = new Date();
    const seeded: CollaborationFieldDef[] = DEFAULT_FIELDS[listType].map((f, index) => ({
      listType,
      key: slugify(f.label),
      label: f.label,
      type: f.type,
      options: f.options,
      required: f.required || false,
      order: index,
      createdAt: now,
      updatedAt: now,
    }));
    await this.fieldRepo.insertMany(seeded);
    return this.fieldRepo.listByType(listType);
  }

  async createField(
    listType: CollaborationListType,
    input: { label: string; type: CollaborationFieldType; options?: string[]; required?: boolean }
  ): Promise<CollaborationFieldDef> {
    const existing = await this.fieldRepo.listByType(listType);
    const usedKeys = new Set(existing.map((f) => f.key));
    let key = slugify(input.label);
    if (usedKeys.has(key)) {
      let i = 2;
      while (usedKeys.has(`${key}_${i}`)) i++;
      key = `${key}_${i}`;
    }
    const nextOrder = existing.reduce((max, f) => Math.max(max, f.order), -1) + 1;
    const now = new Date();
    const field: CollaborationFieldDef = {
      listType,
      key,
      label: input.label.trim(),
      type: input.type,
      options: input.type === 'dropdown' ? (input.options || []).map((o) => o.trim()).filter(Boolean) : undefined,
      required: input.required || false,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    };
    const id = await this.fieldRepo.insertOne(field);
    return { ...field, _id: id };
  }

  // Label/options/required are editable at any time; `type` is intentionally immutable
  // once created (changing it under existing data would silently corrupt values already
  // stored for this key) — delete and recreate the field if a different type is needed.
  async updateField(
    fieldId: string,
    update: { label?: string; options?: string[]; required?: boolean }
  ): Promise<void> {
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (update.label !== undefined) patch.label = update.label.trim();
    if (update.options !== undefined) patch.options = update.options.map((o) => o.trim()).filter(Boolean);
    if (update.required !== undefined) patch.required = update.required;
    await this.fieldRepo.updateById(fieldId, patch);
  }

  async reorderFields(orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, index) => this.fieldRepo.updateById(id, { order: index, updatedAt: new Date() })));
  }

  async deleteField(fieldId: string): Promise<void> {
    await this.fieldRepo.deleteById(fieldId);
  }

  async listRecords(stage: CollaborationStage): Promise<CollaborationRecord[]> {
    return this.recordRepo.listByStage(stage);
  }

  async createRecord(stage: CollaborationStage, values: Record<string, any>, createdBy?: string): Promise<CollaborationRecord> {
    const now = new Date();
    const record: CollaborationRecord = {
      stage,
      values: values || {},
      createdAt: now,
      updatedAt: now,
      createdBy,
      updatedBy: createdBy,
    };
    const id = await this.recordRepo.insertOne(record);
    return { ...record, _id: id };
  }

  async updateRecordValues(recordId: string, valuesPatch: Record<string, any>, updatedBy?: string): Promise<void> {
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (updatedBy) patch.updatedBy = updatedBy;
    for (const [key, val] of Object.entries(valuesPatch || {})) {
      patch[`values.${key}`] = val;
    }
    await this.recordRepo.updateById(recordId, patch);
  }

  async deleteRecord(recordId: string): Promise<void> {
    await this.recordRepo.deleteById(recordId);
  }

  async promoteRecord(recordId: string): Promise<CollaborationRecord | null> {
    await this.recordRepo.updateById(recordId, { stage: 'live', promotedAt: new Date(), updatedAt: new Date() });
    return this.recordRepo.getById(recordId);
  }

  async demoteRecord(recordId: string): Promise<CollaborationRecord | null> {
    await this.recordRepo.updateById(recordId, { stage: 'followup', updatedAt: new Date() });
    return this.recordRepo.getById(recordId);
  }
}
