# Frontend Architecture — OpenNano-CRM

This folder will hold the new feature-sliced frontend (in progress).

```
features/
  auth/         # login, token, guards
  dev-studio/   # TableList, TableDetail, FieldTypePicker
  records/      # DataRowsTable, RowDetail, RowEdit, RelationCell
  hierarchy/    # Hierarchy, OrgDetail, ProjectDetail
  admin/        # UsersPage
shared/
  ui/           # shadcn components
  lib/          # api, personas, format, entityMeta
app/
  App.vue       # shell + hero header + sidebar
  router.ts     # role-aware guards
```

Migration plan:
- Extract `TableDetailPage.vue` (577 lines) → `features/dev-studio/components/FieldsPanel.vue` + `SettingsPanel.vue` + `composables/useFieldDialog.ts`
- Extract `DataRowsTable.vue` logic → `features/records/composables/useTableQuery.ts`
- Keep `shared/ui` untouched

Current pages remain functional under `src/pages/` until migration completes.
