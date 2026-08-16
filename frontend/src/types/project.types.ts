export type ProjectStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  projectCode: string;
  title: string;
  description?: string;
  categoryId: string;
  categoryName: string;
  ministryId: string;
  ministryName: string;
  departmentId: string;
  departmentName: string;
  stateName?: string;
  districtName?: string;
  status: ProjectStatus;
  approvedBudget: number;
  spentAmount: number;
  startDate: string;
  expectedEndDate: string;
  actualEndDate?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}