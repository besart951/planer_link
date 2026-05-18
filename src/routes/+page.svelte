<script lang="ts">
  import { browser } from "$app/environment";
  import { base } from "$app/paths";
  import {
    AlertTriangle,
    FileSpreadsheet,
    LockKeyhole,
    MonitorDown,
    Moon,
    Plus,
    Printer,
    Sun,
    Trash2,
    UserPlus,
  } from "@lucide/svelte";
  import { onMount, tick } from "svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    apiBaseUrl,
    apiUrl,
    isDesktopBuild,
    syncApiToken,
  } from "$lib/client/api";

  import {
    addDaysIso,
    clampNumber,
    cloneDefaultClients,
    cloneDefaultEmployees,
    currentMondayIso,
    dateAppointments,
    dayKeyForIso,
    employeeAppointmentCount,
    enteredDateAppointments,
    formatWeekDate,
    isoDate,
    makeId,
    monthDateItems,
    monthRangeEnd,
    months,
    normaliseClients,
    normaliseDeletedRecords,
    normaliseEmployees,
    plannerStorageKey as storageKey,
    safeFilePart,
    validIsoDate,
    weekDateItems,
    type Appointment,
    type AppointmentField,
    type Client,
    type ClientField,
    type DeletedSyncEntity,
    type DeletedSyncRecord,
    type Employee,
    type PrintOrientation,
    type PrintScope,
    type StoredPlanner,
    type ViewMode,
  } from "$lib/domain/planner";
  import { SyncHttpClient } from "$lib/sync/client";
  import { storedPlannerToSyncChanges } from "$lib/sync/planner-changes";
  import { applySyncRecordsToStoredPlanner } from "$lib/sync/planner-state";

  type ActiveTab = "planning" | "clients";

  interface ClientDialogContext {
    employeeId: string;
    appointmentId: string;
  }

  function inputValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement).value;
  }

  let clients = $state<Client[]>(cloneDefaultClients());
  let employees = $state<Employee[]>(cloneDefaultEmployees());
  let selectedEmployeeId = $state("emp-anna");
  let weekStart = $state(currentMondayIso());
  let activeTab = $state<ActiveTab>("planning");
  let newEmployeeName = $state("");
  let newEmployeeRole = $state("");
  let newEmployeePhone = $state("");
  let hydrated = $state(false);
  let printScope = $state<PrintScope>("all");
  let viewMode = $state<ViewMode>("week");
  let printOrientation = $state<PrintOrientation>("landscape");
  let exportingPlanExcel = $state(false);
  let exportingEmployeeExcel = $state(false);
  let windowsDownloadPassword = $state("");
  let windowsDownloadStatus = $state("");
  let downloadingWindowsApp = $state(false);
  let employeeDeleteCandidateId = $state<string | null>(null);
  let clientDeleteCandidateId = $state<string | null>(null);
  let theme = $state<"light" | "dark">("light");
  let syncDeviceId = $state("");
  let syncCursor = $state<string | null>(null);
  let syncStatus = $state("");
  let syncApplyingRemote = false;
  let syncTimer: number | null = null;
  let clientSearch = $state<Record<string, string>>({});
  let openComboboxId = $state<string | null>(null);
  let clientDialogContext = $state<ClientDialogContext | null>(null);
  let deletedRecords = $state<DeletedSyncRecord[]>([]);
  let dialogClientName = $state("");
  let dialogClientAddress = $state("");
  let dialogClientStart = $state("08:00");
  let dialogClientEnd = $state("08:30");
  let draftClientName = $state("");
  let draftClientAddress = $state("");
  let draftClientStart = $state("08:00");
  let draftClientEnd = $state("08:30");

  let year = $state(2026);
  let month = $state(1);
  let staffSlots = $state(12);
  let tourRows = $state(400);

  const syncCursorKey = `${storageKey}:sync-cursor`;
  const syncDeviceKey = `${storageKey}:device-id`;
  const syncHlcKey = `${storageKey}:last-hlc`;

  const activeEmployee = $derived(
    employees.find((employee) => employee.id === selectedEmployeeId) ??
      employees[0],
  );
  const employeeDeleteCandidate = $derived(
    employees.find((employee) => employee.id === employeeDeleteCandidateId) ??
      null,
  );
  const clientDeleteCandidate = $derived(
    clients.find((client) => client.id === clientDeleteCandidateId) ?? null,
  );
  const weekLabels = $derived(weekDateItems(weekStart));
  const monthLabels = $derived(monthDateItems(year, month));
  const rangeStart = $derived(
    viewMode === "week" ? weekStart : isoDate(year, month, 1),
  );
  const rangeEnd = $derived(
    viewMode === "week" ? addDaysIso(weekStart, 6) : monthRangeEnd(year, month),
  );
  const weekRangeLabel = $derived(
    `${formatWeekDate(weekStart, 0)} - ${formatWeekDate(weekStart, 6)}`,
  );
  const monthRangeLabel = $derived(
    `${months[Math.max(0, Math.min(11, month - 1))]} ${year}`,
  );
  const activeRangeLabel = $derived(
    viewMode === "week" ? `Woche ${weekRangeLabel}` : monthRangeLabel,
  );
  const planningDays = $derived(viewMode === "week" ? weekLabels : monthLabels);
  const printWeekLabels = $derived(
    printScope === "employee" && activeEmployee
      ? weekLabels.filter(
          (day) => enteredDateAppointments(activeEmployee, day.iso).length > 0,
        )
      : weekLabels,
  );
  const printMonthLabels = $derived(
    printScope === "employee" && activeEmployee
      ? monthLabels.filter(
          (day) => enteredDateAppointments(activeEmployee, day.iso).length > 0,
        )
      : monthLabels,
  );
  const logoSrc = $derived(
    `${base}/${theme === "dark" ? "planer_link_long_dark.png" : "planer_link_long_white.png"}`,
  );
  const appIconSrc = $derived(
    `${base}/${theme === "dark" ? "planer_link_small_dark.png" : "planer_link_small_white.png"}`,
  );
  const totalAppointments = $derived(
    employees.reduce(
      (sum, employee) =>
        sum + employeeAppointmentCount(employee, rangeStart, rangeEnd),
      0,
    ),
  );

  onMount(() => {
    const storedTheme = localStorage.getItem("planerlink-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      theme = storedTheme;
    } else if (
      globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches
    ) {
      theme = "dark";
    }

    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as StoredPlanner;
        clients = normaliseClients(parsed.clients);
        deletedRecords = normaliseDeletedRecords(parsed.deletedRecords);
        if (Array.isArray(parsed.employees) && parsed.employees.length > 0) {
          employees = normaliseEmployees(
            parsed.employees,
            parsed.weekStart ?? weekStart,
            clients,
          );
          selectedEmployeeId = parsed.selectedEmployeeId ?? employees[0].id;
        }
        if (parsed.weekStart) {
          weekStart = parsed.weekStart;
        }
        if (parsed.viewMode === "week" || parsed.viewMode === "month") {
          viewMode = parsed.viewMode;
        }
        if (
          parsed.printOrientation === "landscape" ||
          parsed.printOrientation === "portrait"
        ) {
          printOrientation = parsed.printOrientation;
        }
        if (Number.isFinite(parsed.year)) {
          year = clampNumber(Number(parsed.year), 2024, 2035);
        }
        if (Number.isFinite(parsed.month)) {
          month = clampNumber(Number(parsed.month), 1, 12);
        }
        if (Number.isFinite(parsed.staffSlots)) {
          staffSlots = clampNumber(Number(parsed.staffSlots), 4, 30);
        }
        if (Number.isFinite(parsed.tourRows)) {
          tourRows = clampNumber(Number(parsed.tourRows), 100, 1500);
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    syncDeviceId = loadOrCreateSyncDeviceId();
    syncCursor = localStorage.getItem(syncCursorKey);
    hydrated = true;
    void initialiseDesktopSync();
    void syncPlanner(true);
  });

  $effect(() => {
    if (!browser) return;

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#111820" : "#18b845");
    document
      .querySelector('link[rel="icon"]')
      ?.setAttribute("href", appIconSrc);
    document
      .querySelector('link[rel="apple-touch-icon"]')
      ?.setAttribute("href", appIconSrc);

    if (hydrated) {
      localStorage.setItem("planerlink-theme", theme);
    }
  });

  $effect(() => {
    if (!browser || !hydrated) return;

    const payload: StoredPlanner = {
      clients,
      employees,
      deletedRecords,
      selectedEmployeeId,
      weekStart,
      viewMode,
      printOrientation,
      year,
      month,
      staffSlots,
      tourRows,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    schedulePlannerSync();
  });

  function toggleTheme(): void {
    theme = theme === "dark" ? "light" : "dark";
  }

  function loadOrCreateSyncDeviceId(): string {
    const stored = localStorage.getItem(syncDeviceKey);
    if (stored) return stored;

    const id = makeId("device");
    localStorage.setItem(syncDeviceKey, id);
    return id;
  }

  function currentStoredPlanner(): StoredPlanner {
    return {
      clients,
      employees,
      deletedRecords,
      selectedEmployeeId,
      weekStart,
      viewMode,
      printOrientation,
      year,
      month,
      staffSlots,
      tourRows,
    };
  }

  function syncBaseUrl(): string {
    const configuredBase = apiBaseUrl();
    if (configuredBase) return configuredBase;
    return `${window.location.origin}${base}`;
  }

  async function initialiseDesktopSync(): Promise<void> {
    if (!isDesktopBuild() || !syncDeviceId) return;

    try {
      const token = syncApiToken();
      const { initLocalStore, saveAuthToken } =
        await import("$lib/desktop/local-store");
      if (token) await saveAuthToken(token);
      await initLocalStore({ device_id: syncDeviceId });
    } catch {
      syncStatus = "Lokaler Speicher nicht bereit";
    }
  }

  function applyRemotePlanner(
    records: Parameters<typeof applySyncRecordsToStoredPlanner>[0],
  ): void {
    const nextPlanner = applySyncRecordsToStoredPlanner(
      records,
      currentStoredPlanner(),
    );
    syncApplyingRemote = true;

    clients = normaliseClients(nextPlanner.clients);
    employees = normaliseEmployees(
      nextPlanner.employees,
      nextPlanner.weekStart ?? weekStart,
      clients,
    );
    selectedEmployeeId =
      nextPlanner.selectedEmployeeId ?? employees[0]?.id ?? "";
    weekStart = nextPlanner.weekStart ?? weekStart;
    viewMode = nextPlanner.viewMode ?? viewMode;
    printOrientation = nextPlanner.printOrientation ?? printOrientation;
    year = nextPlanner.year ?? year;
    month = nextPlanner.month ?? month;
    staffSlots = nextPlanner.staffSlots ?? staffSlots;
    tourRows = nextPlanner.tourRows ?? tourRows;

    window.setTimeout(() => {
      syncApplyingRemote = false;
    }, 0);
  }

  function schedulePlannerSync(): void {
    if (!browser || !hydrated || syncApplyingRemote || !syncApiToken()) return;
    if (syncTimer) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      void syncPlanner(false);
    }, 1200);
  }

  async function syncPlanner(initial: boolean): Promise<void> {
    if (!browser || !syncDeviceId) return;

    const token = syncApiToken();
    if (!token) {
      syncStatus = "";
      return;
    }

    syncStatus = "Sync läuft";
    const client = new SyncHttpClient({ baseUrl: syncBaseUrl(), token });
    const previousHlc = localStorage.getItem(syncHlcKey);
    const changes = initial
      ? []
      : storedPlannerToSyncChanges({
          storedPlanner: currentStoredPlanner(),
          deviceId: syncDeviceId,
          previousHlc,
        });

    const result = await client.runOnce({
      deviceId: syncDeviceId,
      cursor: syncCursor,
      pendingChanges: changes,
      limit: 500,
    });

    if (result.retryAfterMs) {
      syncStatus = "Sync wartet";
      return;
    }

    const lastHlc = changes.at(-1)?.version_hlc;
    if (lastHlc) localStorage.setItem(syncHlcKey, lastHlc);

    syncCursor = result.pull.next_cursor || result.push.cursor || syncCursor;
    if (syncCursor) localStorage.setItem(syncCursorKey, syncCursor);

    if (result.pull.changes.length > 0) {
      applyRemotePlanner(result.pull.changes);
    }

    syncStatus =
      result.conflicts.length > 0
        ? `${result.conflicts.length} Konflikt(e)`
        : "Synchronisiert";
  }

  function addEmployee(): void {
    const name = newEmployeeName.trim();
    if (!name) return;

    const employee: Employee = {
      id: makeId("emp"),
      name,
      role: newEmployeeRole.trim(),
      phone: newEmployeePhone.trim(),
      appointments: [],
    };

    employees = [...employees, employee];
    selectedEmployeeId = employee.id;
    newEmployeeName = "";
    newEmployeeRole = "";
    newEmployeePhone = "";
  }

  function requestEmployeeDeletion(employeeId: string): void {
    if (employees.length <= 1) return;

    employeeDeleteCandidateId = employeeId;
  }

  function cancelEmployeeDeletion(): void {
    employeeDeleteCandidateId = null;
  }

  function removeEmployee(employeeId: string): void {
    if (employees.length <= 1) return;

    recordDeleted("employee", employeeId);
    for (const employee of employees) {
      if (employee.id !== employeeId) continue;
      for (const appointment of employee.appointments) {
        recordDeleted("appointment", appointment.id);
      }
    }
    employees = employees.filter((employee) => employee.id !== employeeId);
    if (selectedEmployeeId === employeeId) {
      selectedEmployeeId = employees[0]?.id ?? "";
    }
    employeeDeleteCandidateId = null;
  }

  function requestClientDeletion(clientId: string): void {
    clientDeleteCandidateId = clientId;
  }

  function cancelClientDeletion(): void {
    clientDeleteCandidateId = null;
  }

  function removeClient(clientId: string): void {
    recordDeleted("client", clientId);
    clients = clients.filter((client) => client.id !== clientId);
    clientDeleteCandidateId = null;
  }

  function recordDeleted(entity: DeletedSyncEntity, id: string): void {
    const deletedAt = new Date().toISOString();
    deletedRecords = [
      ...deletedRecords.filter(
        (record) => !(record.entity === entity && record.id === id),
      ),
      { entity, id, deletedAt },
    ];
  }

  function createClient(
    name: string,
    defaultStart: string,
    defaultEnd: string,
    address = "",
  ): Client | null {
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const client: Client = {
      id: makeId("client"),
      name: trimmedName,
      address: address.trim(),
      defaultStart,
      defaultEnd,
    };
    clients = [...clients, client];
    return client;
  }

  function updateClient(
    clientId: string,
    field: ClientField,
    value: string,
  ): void {
    clients = clients.map((client) =>
      client.id === clientId ? { ...client, [field]: value } : client,
    );
  }

  function commitDraftClient(): void {
    const client = createClient(
      draftClientName,
      draftClientStart,
      draftClientEnd,
      draftClientAddress,
    );
    if (!client) return;

    draftClientName = "";
    draftClientAddress = "";
    draftClientStart = "08:00";
    draftClientEnd = "08:30";
  }

  function addAppointment(employeeId: string, date: string): void {
    const appointment: Appointment = {
      id: makeId("apt"),
      day: dayKeyForIso(date),
      date,
      clientName: "",
      clientAddress: "",
      start: "",
      end: "",
    };

    employees = employees.map((employee) => {
      if (employee.id !== employeeId) return employee;
      return {
        ...employee,
        appointments: [...employee.appointments, appointment],
      };
    });

    openComboboxId = appointment.id;
    clientSearch = { ...clientSearch, [appointment.id]: "" };
    if (clients.length === 0) {
      openCreateClientDialog(employeeId, appointment.id, "");
    }
  }

  function updateAppointment(
    employeeId: string,
    appointmentId: string,
    field: AppointmentField,
    value: string,
  ): void {
    employees = employees.map((employee) => {
      if (employee.id !== employeeId) return employee;

      return {
        ...employee,
        appointments: employee.appointments.map((appointment) => {
          if (appointment.id !== appointmentId) return appointment;
          const updated = { ...appointment, [field]: value };
          if (field === "date" && validIsoDate(value)) {
            updated.day = dayKeyForIso(value);
          }
          return updated;
        }),
      };
    });
  }

  function selectAppointmentClient(
    employeeId: string,
    appointmentId: string,
    client: Client,
  ): void {
    employees = employees.map((employee) => {
      if (employee.id !== employeeId) return employee;

      return {
        ...employee,
        appointments: employee.appointments.map((appointment) =>
          appointment.id === appointmentId
            ? {
                ...appointment,
                clientName: client.name,
                clientAddress: client.address,
                start: client.defaultStart,
                end: client.defaultEnd,
              }
            : appointment,
        ),
      };
    });
    clientSearch = { ...clientSearch, [appointmentId]: client.name };
    openComboboxId = null;
  }

  function removeAppointment(employeeId: string, appointmentId: string): void {
    recordDeleted("appointment", appointmentId);
    employees = employees.map((employee) => {
      if (employee.id !== employeeId) return employee;

      return {
        ...employee,
        appointments: employee.appointments.filter(
          (appointment) => appointment.id !== appointmentId,
        ),
      };
    });
    const { [appointmentId]: _removed, ...remainingSearch } = clientSearch;
    clientSearch = remainingSearch;
  }

  function appointmentClientName(appointment: Appointment): string {
    return appointment.clientName;
  }

  function appointmentSearchValue(appointment: Appointment): string {
    return clientSearch[appointment.id] ?? appointmentClientName(appointment);
  }

  function filteredClients(query: string): Client[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return clients;

    return clients.filter((client) =>
      client.name.toLowerCase().includes(normalized),
    );
  }

  function openCreateClientDialog(
    employeeId: string,
    appointmentId: string,
    initialName: string,
  ): void {
    clientDialogContext = { employeeId, appointmentId };
    dialogClientName = initialName.trim();
    dialogClientAddress = "";
    dialogClientStart = "08:00";
    dialogClientEnd = "08:30";
    openComboboxId = null;
  }

  function cancelClientDialog(): void {
    clientDialogContext = null;
    dialogClientName = "";
    dialogClientAddress = "";
    dialogClientStart = "08:00";
    dialogClientEnd = "08:30";
  }

  function createDialogClient(): void {
    if (!clientDialogContext) return;

    const client = createClient(
      dialogClientName,
      dialogClientStart,
      dialogClientEnd,
      dialogClientAddress,
    );
    if (!client) return;

    selectAppointmentClient(
      clientDialogContext.employeeId,
      clientDialogContext.appointmentId,
      client,
    );
    cancelClientDialog();
  }

  async function exportPdf(scope: PrintScope): Promise<void> {
    printScope = scope;
    await tick();
    window.addEventListener("afterprint", () => (printScope = "all"), {
      once: true,
    });
    window.print();
  }

  async function exportPlanExcel(): Promise<void> {
    exportingPlanExcel = true;

    try {
      const response = await fetch(apiUrl("/plan-excel"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employees, clients, weekStart, viewMode, year, month }),
      });

      if (!response.ok) {
        throw new Error(`Excel-Export fehlgeschlagen (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        viewMode === "week"
          ? `wochenplan-${weekStart}.xlsx`
          : `monatsplan-${year}-${String(month).padStart(2, "0")}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      exportingPlanExcel = false;
    }
  }

  async function exportEmployeeExcel(employee: Employee): Promise<void> {
    exportingEmployeeExcel = true;

    try {
      const response = await fetch(apiUrl("/employee-excel"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employee, clients, weekStart, viewMode, year, month }),
      });

      if (!response.ok) {
        throw new Error(`Excel-Export fehlgeschlagen (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const employeePart = safeFilePart(employee.name) || "mitarbeiter";
      link.href = objectUrl;
      link.download =
        viewMode === "week"
          ? `wochenplan-${employeePart}-${weekStart}.xlsx`
          : `monatsplan-${employeePart}-${year}-${String(month).padStart(2, "0")}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      exportingEmployeeExcel = false;
    }
  }

  function filenameFromDisposition(disposition: string | null): string {
    const fallback = "besmir-spitex-einsatzplanung-windows.exe";
    const match =
      disposition?.match(/filename="([^"]+)"/i) ??
      disposition?.match(/filename=([^;]+)/i);
    return match?.[1]?.trim() || fallback;
  }

  async function downloadWindowsApp(): Promise<void> {
    const password = windowsDownloadPassword.trim();
    if (!password) {
      windowsDownloadStatus = "Passwort fehlt.";
      return;
    }

    downloadingWindowsApp = true;
    windowsDownloadStatus = "";

    try {
      const response = await fetch(apiUrl("/windows-download"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        windowsDownloadStatus =
          payload?.error ?? `Download fehlgeschlagen (${response.status}).`;
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filenameFromDisposition(
        response.headers.get("content-disposition"),
      );
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      windowsDownloadPassword = "";
      windowsDownloadStatus = "Download gestartet.";
    } finally {
      downloadingWindowsApp = false;
    }
  }
</script>

<svelte:head>
  <title>Spitex Einsatzplanung | Besmir</title>
  <meta
    name="description"
    content="Einfache Einsatzplanung für Spitex-Mitarbeitende mit Klienten, Zeiten und PDF-Druck."
  />
  <style media="print">
    @page {
      size: A4 {printOrientation};
      margin: 8mm;
    }
  </style>
</svelte:head>

<main class="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
  <div class="app-shell mx-auto flex w-full max-w-[1500px] flex-col gap-5">
    <header class="no-print flex flex-wrap items-center justify-between gap-3">
      <img
        class="h-12 w-auto max-w-[min(22rem,100%)] object-contain"
        src={logoSrc}
        alt="Planerlink"
      />
      <div class="flex items-center gap-2">
        <Badge variant="secondary"
          >{viewMode === "week" ? weekRangeLabel : monthRangeLabel}</Badge
        >
        {#if syncStatus}
          <Badge variant="secondary">{syncStatus}</Badge>
        {/if}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={theme === "dark"
            ? "Helles Theme aktivieren"
            : "Dunkles Theme aktivieren"}
          title={theme === "dark" ? "Helles Theme" : "Dunkles Theme"}
          onclick={toggleTheme}
        >
          {#if theme === "dark"}
            <Sun class="size-4" />
          {:else}
            <Moon class="size-4" />
          {/if}
        </Button>
      </div>
    </header>

    <section class="no-print flex flex-wrap items-center justify-between gap-3">
      <div class="inline-flex rounded-lg border bg-card p-1 shadow-xs">
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-medium transition-colors"
          class:bg-primary={activeTab === "planning"}
          class:text-primary-foreground={activeTab === "planning"}
          class:text-muted-foreground={activeTab !== "planning"}
          onclick={() => (activeTab = "planning")}
        >
          Planung
        </button>
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-medium transition-colors"
          class:bg-primary={activeTab === "clients"}
          class:text-primary-foreground={activeTab === "clients"}
          class:text-muted-foreground={activeTab !== "clients"}
          onclick={() => (activeTab = "clients")}
        >
          Klienten
        </button>
      </div>
    </section>

    <section class="no-print">
      <Card class="rounded-lg">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Printer class="size-5 text-primary" />
            Ausgabe
          </CardTitle>
          <CardDescription>
            PDF-Ausgabe als {printOrientation === "landscape"
              ? "Querformat"
              : "Hochformat"}
          </CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Ansicht und Einplanung
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              bind:value={viewMode}
            >
              <option value="week">Wöchentlich</option>
              <option value="month">Monatlich</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            PDF-Ausrichtung
            <select
              class="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              bind:value={printOrientation}
            >
              <option value="landscape">Querformat</option>
              <option value="portrait">Hochformat</option>
            </select>
          </label>
          {#if viewMode === "week"}
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Wochenbeginn
              <Input type="date" bind:value={weekStart} />
            </label>
          {:else}
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Jahr
              <Input type="number" min="2024" max="2035" bind:value={year} />
            </label>
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Monat
              <select
                class="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                bind:value={month}
              >
                {#each months as name, index}
                  <option value={index + 1}>{name}</option>
                {/each}
              </select>
            </label>
          {/if}
          <Button
            onclick={() => exportPdf("all")}
            class="min-w-0 w-full whitespace-normal"
          >
            <Printer class="size-4" />
            {viewMode === "week" ? "Woche" : "Monat"} als PDF
          </Button>
          <Button
            variant="outline"
            disabled={exportingPlanExcel}
            onclick={exportPlanExcel}
            class="min-w-0 w-full whitespace-normal"
          >
            <FileSpreadsheet class="size-4" />
            {viewMode === "week" ? "Woche" : "Monat"} als Excel
          </Button>
        </CardContent>
      </Card>
    </section>

    {#if activeTab === "planning"}
      <section class="no-print grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div class="flex flex-col gap-4">
          <Card class="rounded-lg">
            <CardHeader>
              <CardTitle class="flex items-center gap-2">
                <UserPlus class="size-5 text-primary" />
                Mitarbeiter erstellen
              </CardTitle>
              <CardDescription
                >Name reicht aus, Rolle und Telefon sind optional</CardDescription
              >
            </CardHeader>
            <CardContent class="flex flex-col gap-3">
              <label class="flex flex-col gap-1.5 text-sm font-medium">
                Name
                <Input
                  placeholder="z.B. Lejla Krasniqi"
                  bind:value={newEmployeeName}
                />
              </label>
              <label class="flex flex-col gap-1.5 text-sm font-medium">
                Rolle
                <Input placeholder="z.B. FaGe" bind:value={newEmployeeRole} />
              </label>
              <label class="flex flex-col gap-1.5 text-sm font-medium">
                Telefon
                <Input placeholder="+41 ..." bind:value={newEmployeePhone} />
              </label>
              <Button onclick={addEmployee}>
                <Plus class="size-4" />
                Mitarbeiter hinzufügen
              </Button>
            </CardContent>
          </Card>

          <Card class="rounded-lg">
            <CardHeader>
              <CardTitle>Mitarbeitende</CardTitle>
              <CardDescription>Auswählen und Plan bearbeiten</CardDescription>
            </CardHeader>
            <CardContent class="space-y-2">
              {#each employees as employee}
                <div
                  class="flex items-center justify-between gap-3 rounded-md border p-3 transition-colors"
                  class:bg-accent={employee.id === selectedEmployeeId}
                >
                  <button
                    type="button"
                    class="min-w-0 flex-1 text-left"
                    onclick={() => (selectedEmployeeId = employee.id)}
                  >
                    <div class="truncate font-medium">{employee.name}</div>
                    <div class="truncate text-sm text-muted-foreground">
                      {employee.role || "Keine Rolle"} · {employeeAppointmentCount(
                        employee,
                        rangeStart,
                        rangeEnd,
                      )} Termine
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={employees.length <= 1}
                    aria-label={`${employee.name} endgültig entfernen`}
                    onclick={() => requestEmployeeDeletion(employee.id)}
                  >
                    <Trash2 class="size-4" />
                  </Button>
                </div>
              {/each}
            </CardContent>
          </Card>
        </div>

        {#if activeEmployee}
          <Card class="rounded-lg">
            <CardHeader>
              <CardTitle
                class="flex flex-wrap items-center justify-between gap-3"
              >
                <span>{activeEmployee.name}</span>
                <Badge variant="secondary" class="rounded-md">
                  {activeRangeLabel}
                </Badge>
              </CardTitle>
              <CardDescription>
                Termine werden direkt pro Datum erfasst.
              </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-4">
              <div
                class="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-2"
              >
                <Button onclick={() => exportPdf("employee")} class="w-full">
                  <Printer class="size-4" />
                  PDF aktueller Mitarbeiter
                </Button>
                <Button
                  variant="outline"
                  class="w-full"
                  disabled={exportingEmployeeExcel}
                  onclick={() => exportEmployeeExcel(activeEmployee)}
                >
                  <FileSpreadsheet class="size-4" />
                  Excel aktueller Mitarbeiter
                </Button>
              </div>

              <div class="grid gap-3 xl:grid-cols-2">
                {#each planningDays as day}
                  <section class="rounded-md border bg-background p-3">
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <h3 class="font-semibold">{day.full}</h3>
                        <p class="text-sm text-muted-foreground">
                          {day.dateLabel}{viewMode === "month"
                            ? `.${String(year).slice(2)}`
                            : ""}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => addAppointment(activeEmployee.id, day.iso)}
                      >
                        <Plus class="size-4" />
                        Termin
                      </Button>
                    </div>

                    <div class="mt-3 flex flex-col gap-3">
                      {#each dateAppointments(activeEmployee, day.iso) as appointment}
                        <div class="rounded-md border bg-card p-3">
                          <div class="grid gap-2 sm:grid-cols-2">
                            <label
                              class="relative flex flex-col gap-1 text-xs font-medium sm:col-span-2"
                            >
                              Klient/in
                              <Input
                                role="combobox"
                                autocomplete="off"
                                value={appointmentSearchValue(appointment)}
                                placeholder="Klient suchen oder neu erstellen"
                                aria-expanded={openComboboxId === appointment.id}
                                onfocus={() => {
                                  openComboboxId = appointment.id;
                                  clientSearch = {
                                    ...clientSearch,
                                    [appointment.id]: appointmentSearchValue(
                                      appointment,
                                    ),
                                  };
                                }}
                                oninput={(event) => {
                                  openComboboxId = appointment.id;
                                  clientSearch = {
                                    ...clientSearch,
                                    [appointment.id]: inputValue(event),
                                  };
                                }}
                                onkeydown={(event) => {
                                  if (event.key === "Escape") {
                                    openComboboxId = null;
                                  }
                                }}
                              />
                              {#if openComboboxId === appointment.id}
                                {@const query = clientSearch[appointment.id] ?? ""}
                                <div
                                  class="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
                                >
                                  <button
                                    type="button"
                                    class="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                                    onmousedown={(event) => event.preventDefault()}
                                    onclick={() =>
                                      openCreateClientDialog(
                                        activeEmployee.id,
                                        appointment.id,
                                        query,
                                      )}
                                  >
                                    <Plus class="size-4" />
                                    Neuen Klienten erstellen
                                  </button>
                                  {#each filteredClients(query) as client}
                                    <button
                                      type="button"
                                      class="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                                      onmousedown={(event) =>
                                        event.preventDefault()}
                                      onclick={() =>
                                        selectAppointmentClient(
                                          activeEmployee.id,
                                          appointment.id,
                                          client,
                                        )}
                                    >
                                      <span class="min-w-0 truncate"
                                        >{client.name}</span
                                      >
                                      <span
                                        class="shrink-0 text-xs text-muted-foreground"
                                      >
                                        {client.defaultStart || "--:--"} - {client.defaultEnd ||
                                          "--:--"}
                                      </span>
                                    </button>
                                  {:else}
                                    <div
                                      class="px-3 py-2 text-sm text-muted-foreground"
                                    >
                                      Kein Klient gefunden.
                                    </div>
                                  {/each}
                                </div>
                              {/if}
                            </label>
                            <label
                              class="flex flex-col gap-1 text-xs font-medium"
                            >
                              Start
                              <Input
                                type="time"
                                value={appointment.start}
                                oninput={(event) =>
                                  updateAppointment(
                                    activeEmployee.id,
                                    appointment.id,
                                    "start",
                                    inputValue(event),
                                  )}
                              />
                            </label>
                            <label
                              class="flex flex-col gap-1 text-xs font-medium"
                            >
                              Ende
                              <Input
                                type="time"
                                value={appointment.end}
                                oninput={(event) =>
                                  updateAppointment(
                                    activeEmployee.id,
                                    appointment.id,
                                    "end",
                                    inputValue(event),
                                  )}
                              />
                            </label>
                          </div>
                          <div class="mt-3 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onclick={() =>
                                removeAppointment(
                                  activeEmployee.id,
                                  appointment.id,
                                )}
                            >
                              <Trash2 class="size-4" />
                              Entfernen
                            </Button>
                          </div>
                        </div>
                      {:else}
                        <p
                          class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
                        >
                          Noch kein Termin eingetragen.
                        </p>
                      {/each}
                    </div>
                  </section>
                {/each}
              </div>
            </CardContent>
          </Card>
        {/if}
      </section>
    {:else}
      <section class="no-print">
        <Card class="rounded-lg">
          <CardHeader>
            <CardTitle>Klienten</CardTitle>
            <CardDescription>
              Änderungen werden sofort gespeichert und für neue Termine übernommen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr class="border-b text-left text-muted-foreground">
                    <th class="px-2 py-2 font-medium">Name</th>
                    <th class="px-2 py-2 font-medium">Adresse</th>
                    <th class="w-40 px-2 py-2 font-medium">Beginn</th>
                    <th class="w-40 px-2 py-2 font-medium">Ende</th>
                    <th class="w-16 px-2 py-2 font-medium">
                      <span class="sr-only">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {#each clients as client}
                    <tr class="border-b">
                      <td class="px-2 py-2">
                        <Input
                          value={client.name}
                          oninput={(event) =>
                            updateClient(client.id, "name", inputValue(event))}
                        />
                      </td>
                      <td class="px-2 py-2">
                        <Input
                          value={client.address}
                          placeholder="Adresse optional"
                          oninput={(event) =>
                            updateClient(
                              client.id,
                              "address",
                              inputValue(event),
                            )}
                        />
                      </td>
                      <td class="px-2 py-2">
                        <Input
                          type="time"
                          value={client.defaultStart}
                          oninput={(event) =>
                            updateClient(
                              client.id,
                              "defaultStart",
                              inputValue(event),
                            )}
                        />
                      </td>
                      <td class="px-2 py-2">
                        <Input
                          type="time"
                          value={client.defaultEnd}
                          oninput={(event) =>
                            updateClient(
                              client.id,
                              "defaultEnd",
                              inputValue(event),
                            )}
                        />
                      </td>
                      <td class="px-2 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Klient löschen"
                          onclick={() => requestClientDeletion(client.id)}
                        >
                          <Trash2 class="size-4" />
                          <span class="sr-only">Klient löschen</span>
                        </Button>
                      </td>
                    </tr>
                  {/each}
                  <tr>
                    <td class="px-2 py-2">
                      <Input
                        placeholder="Neuer Klient"
                        value={draftClientName}
                        oninput={(event) => (draftClientName = inputValue(event))}
                        onblur={commitDraftClient}
                        onkeydown={(event) => {
                          if (event.key === "Enter") commitDraftClient();
                        }}
                      />
                    </td>
                    <td class="px-2 py-2">
                      <Input
                        placeholder="Adresse optional"
                        bind:value={draftClientAddress}
                        onkeydown={(event) => {
                          if (event.key === "Enter") commitDraftClient();
                        }}
                      />
                    </td>
                    <td class="px-2 py-2">
                      <Input type="time" bind:value={draftClientStart} />
                    </td>
                    <td class="px-2 py-2">
                      <Input type="time" bind:value={draftClientEnd} />
                    </td>
                    <td class="px-2 py-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    {/if}

    <section
      id="pdf-export"
      class="print-area rounded-lg border bg-card p-4 shadow-sm"
      class:print-portrait={printOrientation === "portrait"}
      class:print-month={viewMode === "month"}
    >
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-2xl font-semibold">
            {#if printScope === "employee" && activeEmployee}
              Einsatzplan {activeEmployee.name} · {activeRangeLabel}
            {:else}
              Einsatzplan {activeRangeLabel}
            {/if}
          </h2>
        </div>
        <div class="text-right text-sm text-muted-foreground">
          {#if printScope === "employee" && activeEmployee}
            <div>{activeEmployee.role || "Keine Rolle"}</div>
            <div>
              {employeeAppointmentCount(activeEmployee, rangeStart, rangeEnd)} Termine
            </div>
          {:else}
            <div>{employees.length} Mitarbeitende</div>
            <div>{totalAppointments} Termine</div>
          {/if}
        </div>
      </div>

      {#if viewMode === "week"}
        <div class="overflow-x-auto">
          <table
            class={`schedule-table w-full table-fixed border-collapse text-sm ${printScope === "employee" ? "min-w-[520px]" : "min-w-[1080px]"}`}
          >
            <thead>
              <tr class="bg-[var(--primary)] text-primary-foreground">
                <th class="schedule-employee-cell border px-3 py-2 text-left"
                  >Mitarbeiter/in</th
                >
                {#each printWeekLabels as day}
                  <th class="schedule-day-cell border px-3 py-2 text-left">
                    {day.label}<br />{day.dateLabel}
                  </th>
                {/each}
                <th class="schedule-total-cell border px-3 py-2 text-left"
                  >Termine</th
                >
              </tr>
            </thead>
            <tbody>
              {#each employees as employee}
                {#if printScope === "all" || employee.id === activeEmployee?.id}
                  <tr>
                    <td
                      class="schedule-employee-cell border px-3 py-2 align-top"
                    >
                      <div class="font-semibold">{employee.name}</div>
                      <div class="text-xs text-muted-foreground">
                        {employee.role || "Keine Rolle"}
                      </div>
                      <div class="text-xs text-muted-foreground">
                        {employee.phone}
                      </div>
                    </td>
                    {#each printWeekLabels as day}
                      {@const appointments = enteredDateAppointments(
                        employee,
                        day.iso,
                      )}
                      <td class="schedule-day-cell border px-2 py-2 align-top">
                        {#each appointments as appointment}
                          <div
                            class="schedule-appointment mb-2 rounded-sm bg-muted p-1.5 text-xs"
                          >
                            <div class="font-semibold">
                              {appointment.start} - {appointment.end}
                            </div>
                            <div>
                              {appointmentClientName(appointment) ||
                                "Klient/in"}
                            </div>
                            {#if appointment.clientAddress}
                              <div class="text-muted-foreground">
                                {appointment.clientAddress}
                              </div>
                            {/if}
                          </div>
                        {:else}
                          <div class="text-xs text-muted-foreground">
                            Keine Termine
                          </div>
                        {/each}
                      </td>
                    {/each}
                    <td class="schedule-total-cell border px-3 py-2 align-top">
                      {employeeAppointmentCount(employee, rangeStart, rangeEnd)}
                    </td>
                  </tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table
            class="month-schedule-table w-full min-w-[760px] table-fixed border-collapse text-sm"
          >
            <thead>
              <tr class="bg-[var(--primary)] text-primary-foreground">
                <th class="month-date-cell border px-3 py-2 text-left">Datum</th
                >
                <th class="month-employee-cell border px-3 py-2 text-left"
                  >Mitarbeiter/in</th
                >
                <th class="border px-3 py-2 text-left">Termine</th>
              </tr>
            </thead>
            <tbody>
              {#each printMonthLabels as day}
                {#each employees as employee}
                  {@const appointments = enteredDateAppointments(
                    employee,
                    day.iso,
                  )}
                  {#if appointments.length > 0 && (printScope === "all" || employee.id === activeEmployee?.id)}
                    <tr class:bg-muted={day.isWeekend}>
                      <td class="month-date-cell border px-3 py-2 align-top">
                        <div class="font-semibold">{day.full}</div>
                        <div>{day.dateLabel}</div>
                      </td>
                      <td
                        class="month-employee-cell border px-3 py-2 align-top"
                      >
                        <div class="font-semibold">{employee.name}</div>
                        <div class="text-xs text-muted-foreground">
                          {employee.role || "Keine Rolle"}
                        </div>
                      </td>
                      <td class="border px-2 py-2 align-top">
                        {#each appointments as appointment}
                          <div
                            class="schedule-appointment mb-2 rounded-sm bg-muted p-1.5 text-xs"
                          >
                            <div class="font-semibold">
                              {appointment.start} - {appointment.end}
                            </div>
                            <div>
                              {appointmentClientName(appointment) ||
                                "Klient/in"}
                            </div>
                            {#if appointment.clientAddress}
                              <div class="text-muted-foreground">
                                {appointment.clientAddress}
                              </div>
                            {/if}
                          </div>
                        {:else}
                          <div class="text-xs text-muted-foreground">
                            Keine Termine
                          </div>
                        {/each}
                      </td>
                    </tr>
                  {/if}
                {/each}
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="no-print grid gap-4 xl:grid-cols-[380px]">
      <Card class="rounded-lg">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <MonitorDown class="size-5 text-primary" />
            Windows App
          </CardTitle>
          <CardDescription>Geschützter Installer</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3">
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Passwort
            <Input
              type="password"
              autocomplete="current-password"
              bind:value={windowsDownloadPassword}
              onkeydown={(event) => {
                if (event.key === "Enter") void downloadWindowsApp();
              }}
            />
          </label>
          <Button
            class="w-full"
            size="lg"
            disabled={downloadingWindowsApp}
            onclick={downloadWindowsApp}
          >
            <LockKeyhole class="size-4" />
            {downloadingWindowsApp
              ? "Download wird vorbereitet..."
              : "Windows-App herunterladen"}
          </Button>
          {#if windowsDownloadStatus}
            <p class="text-sm text-muted-foreground">{windowsDownloadStatus}</p>
          {/if}
        </CardContent>
      </Card>
    </section>

    {#if employeeDeleteCandidate}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 py-6"
      >
        <div
          aria-labelledby="delete-employee-title"
          aria-describedby="delete-employee-description"
          aria-modal="true"
          role="dialog"
          class="w-full max-w-md rounded-lg border bg-card p-5 text-card-foreground shadow-xl"
        >
          <div class="flex items-start gap-3">
            <div class="rounded-md bg-destructive/10 p-2 text-destructive">
              <AlertTriangle class="size-5" />
            </div>
            <div class="min-w-0">
              <h2 id="delete-employee-title" class="text-lg font-semibold">
                Mitarbeiter endgültig löschen?
              </h2>
              <p
                id="delete-employee-description"
                class="mt-2 text-sm leading-6 text-muted-foreground"
              >
                Sind Sie sicher? {employeeDeleteCandidate.name} und alle zugehörigen
                Termine werden endgültig gelöscht. Diese Aktion kann nicht rückgängig
                gemacht werden.
              </p>
            </div>
          </div>

          <div
            class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
            <Button variant="outline" onclick={cancelEmployeeDeletion}
              >Abbrechen</Button
            >
            <Button
              variant="destructive"
              onclick={() => removeEmployee(employeeDeleteCandidate.id)}
            >
              <Trash2 class="size-4" />
              Endgültig löschen
            </Button>
          </div>
        </div>
      </div>
    {/if}

    {#if clientDeleteCandidate}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 py-6"
      >
        <div
          aria-labelledby="delete-client-title"
          aria-describedby="delete-client-description"
          aria-modal="true"
          role="dialog"
          class="w-full max-w-md rounded-lg border bg-card p-5 text-card-foreground shadow-xl"
        >
          <div class="flex items-start gap-3">
            <div class="rounded-md bg-destructive/10 p-2 text-destructive">
              <AlertTriangle class="size-5" />
            </div>
            <div class="min-w-0">
              <h2 id="delete-client-title" class="text-lg font-semibold">
                Klient löschen?
              </h2>
              <p
                id="delete-client-description"
                class="mt-2 text-sm leading-6 text-muted-foreground"
              >
                {clientDeleteCandidate.name} wird nur aus den Klienten-Stammdaten
                entfernt. Bereits erfasste Termine behalten Name, Adresse und
                Zeiten unverändert.
              </p>
            </div>
          </div>

          <div
            class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
            <Button variant="outline" onclick={cancelClientDeletion}
              >Abbrechen</Button
            >
            <Button
              variant="destructive"
              onclick={() => removeClient(clientDeleteCandidate.id)}
            >
              <Trash2 class="size-4" />
              Klient löschen
            </Button>
          </div>
        </div>
      </div>
    {/if}

    {#if clientDialogContext}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 py-6"
      >
        <div
          aria-labelledby="client-dialog-title"
          aria-modal="true"
          role="dialog"
          class="w-full max-w-md rounded-lg border bg-card p-5 text-card-foreground shadow-xl"
        >
          <h2 id="client-dialog-title" class="text-lg font-semibold">
            Neuen Klienten erstellen
          </h2>
          <div class="mt-4 grid gap-3">
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Name
              <Input bind:value={dialogClientName} autofocus />
            </label>
            <label class="flex flex-col gap-1.5 text-sm font-medium">
              Adresse
              <Input
                bind:value={dialogClientAddress}
                placeholder="Adresse optional"
              />
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="flex flex-col gap-1.5 text-sm font-medium">
                Beginn
                <Input type="time" bind:value={dialogClientStart} />
              </label>
              <label class="flex flex-col gap-1.5 text-sm font-medium">
                Ende
                <Input type="time" bind:value={dialogClientEnd} />
              </label>
            </div>
          </div>
          <div
            class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
            <Button variant="outline" onclick={cancelClientDialog}
              >Abbrechen</Button
            >
            <Button onclick={createDialogClient}>
              <Plus class="size-4" />
              Klient erstellen
            </Button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</main>
