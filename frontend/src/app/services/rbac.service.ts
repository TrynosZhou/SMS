import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RbacModule {
  key: string;
  label: string;
  routeModule?: string;
  group?: string;
  description?: string;
}

export interface RbacModuleGroup {
  key: string;
  label: string;
}

export interface FinancePageDef {
  key: string;
  label: string;
  group: string;
  description?: string;
  sensitive?: boolean;
}

export interface FinancePageGroup {
  key: string;
  label: string;
}

export interface RbacRoleGroup {
  key: string;
  label: string;
  slugs: string[];
}

export interface RbacRole {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isSystem: boolean;
  legacyRoleKey?: string | null;
  permissions: Record<string, boolean>;
}

export interface RbacUserRow {
  id: string;
  username?: string;
  email?: string;
  role: string;
  isActive: boolean;
  fullName?: string;
  rbacRoles: { id: string; name: string; slug: string }[];
}

@Injectable({ providedIn: 'root' })
export class RbacService {
  private apiUrl = `${environment.apiUrl}/rbac`;

  constructor(private http: HttpClient) {}

  getCatalog(): Observable<{
    modules: RbacModule[];
    moduleGroups?: RbacModuleGroup[];
    actions: string[];
    financePages?: FinancePageDef[];
    financePageActions?: string[];
    financePageGroups?: FinancePageGroup[];
    roleGroups?: RbacRoleGroup[];
  }> {
    return this.http.get<{
      modules: RbacModule[];
      moduleGroups?: RbacModuleGroup[];
      actions: string[];
      financePages?: FinancePageDef[];
      financePageActions?: string[];
      financePageGroups?: FinancePageGroup[];
      roleGroups?: RbacRoleGroup[];
    }>(`${this.apiUrl}/catalog`);
  }

  listRoles(): Observable<{ roles: RbacRole[] }> {
    return this.http.get<{ roles: RbacRole[] }>(`${this.apiUrl}/roles`);
  }

  createRole(payload: { name: string; description?: string; permissions?: Record<string, boolean> }): Observable<any> {
    return this.http.post(`${this.apiUrl}/roles`, payload);
  }

  updateRole(id: string, payload: Partial<{ name: string; description: string; permissions: Record<string, boolean> }>): Observable<any> {
    return this.http.put(`${this.apiUrl}/roles/${id}`, payload);
  }

  deleteRole(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/roles/${id}`);
  }

  listUsers(): Observable<{ users: RbacUserRow[] }> {
    return this.http.get<{ users: RbacUserRow[] }>(`${this.apiUrl}/users`);
  }

  updateUserRoles(userId: string, roleIds: string[]): Observable<any> {
    return this.http.put(`${this.apiUrl}/users/${userId}/roles`, { roleIds });
  }

  getMyPermissions(): Observable<{ permissions: Record<string, boolean>; role: string }> {
    return this.http.get<{ permissions: Record<string, boolean>; role: string }>(`${this.apiUrl}/me`);
  }
}
