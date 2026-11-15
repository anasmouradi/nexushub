"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import {
  priorities,
  priorityColors,
  priorityLabels,
  isPriority,
  isProjectStatus,
  projectStatuses,
  projectStatusColors,
  projectStatusLabels,
  type Priority,
  type ProjectStatus,
} from "@/lib/enums";
import { useUrlSearch } from "@/lib/use-url-search";
import { dateInputToIso, formatDate } from "@/lib/format";
import { createProject, getProjects } from "@/lib/projects";
import { getCompanyUsers, getTeams } from "@/lib/teams";

const createProjectSchema = z
  .object({
    name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
    description: z.string().trim().max(1000, "1000 caractères maximum"),
    status: z.enum(projectStatuses),
    priority: z.enum(priorities),
    startDate: z.string(),
    dueDate: z.string(),
    managerId: z.string(),
    teamId: z.string(),
    addTeamMembers: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.startDate && values.dueDate && values.dueDate < values.startDate) {
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "L’échéance doit être après la date de début.",
      });
    }
    if (values.addTeamMembers && !values.teamId) {
      context.addIssue({
        code: "custom",
        path: ["teamId"],
        message: "Choisissez une équipe pour ajouter ses membres.",
      });
    }
  });

type CreateProjectValues = z.infer<typeof createProjectSchema>;

function displayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

function NativeSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
      >
        {children}
      </select>
    </label>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const urlSearch = useUrlSearch();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [statusOverride, setStatusOverride] = useState<ProjectStatus | "" | null>(
    null,
  );
  const queryStatus = new URLSearchParams(urlSearch).get("status") ?? "";
  const status =
    statusOverride ??
    (isProjectStatus(queryStatus) ? queryStatus : "");
  const [priority, setPriority] = useState<Priority | "">("");
  const [search, setSearch] = useState("");
  const projectsQuery = useQuery({
    queryKey: ["projects", { page, status, priority, search }],
    queryFn: () =>
      getProjects({
        page,
        limit: 10,
        ...(status && { status }),
        ...(priority && { priority }),
        search,
      }),
  });
  const canCreate =
    user?.role === "COMPANY_ADMIN" || user?.role === "MANAGER";
  const usersQuery = useQuery({
    queryKey: ["company-users"],
    queryFn: getCompanyUsers,
    enabled: dialogOpen && canCreate,
  });
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: getTeams,
    enabled: dialogOpen && canCreate,
  });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "PLANNING",
      priority: "MEDIUM",
      startDate: "",
      dueDate: "",
      managerId: "",
      teamId: "",
      addTeamMembers: false,
    },
  });
  const selectedTeamId = useWatch({ control, name: "teamId" });
  const addTeamMembers = useWatch({ control, name: "addTeamMembers" });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setDialogOpen(false);
      reset();
      toast.success("Projet créé");
      router.push(`/projects/${project.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    },
  });

  const onSubmit = (values: CreateProjectValues) => {
    const startDate = dateInputToIso(values.startDate);
    const dueDate = dateInputToIso(values.dueDate);
    createMutation.mutate({
      name: values.name,
      ...(values.description && { description: values.description }),
      status: values.status,
      priority: values.priority,
      ...(startDate && { startDate }),
      ...(dueDate && { dueDate }),
      ...(values.managerId && { managerId: values.managerId }),
      ...(values.teamId && { teamId: values.teamId }),
      addTeamMembers: values.addTeamMembers,
    });
  };

  const projects = projectsQuery.data;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Projets</h1>
          <p className="text-sm text-muted-foreground">
            Suivez l’avancement des projets de votre entreprise.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            Nouveau projet
          </Button>
        )}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          aria-label="Rechercher un projet"
          placeholder="Rechercher un projet…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <NativeSelect
          label="Statut"
          value={status}
          onChange={(value) => {
            setStatusOverride(
              value === "" || isProjectStatus(value) ? value : "",
            );
            setPage(1);
          }}
        >
          <option value="">Tous les statuts</option>
          {projectStatuses.map((value) => (
            <option key={value} value={value}>
              {projectStatusLabels[value]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          label="Priorité"
          value={priority}
          onChange={(value) => {
            setPriority(value === "" || isPriority(value) ? value : "");
            setPage(1);
          }}
        >
          <option value="">Toutes les priorités</option>
          {priorities.map((value) => (
            <option key={value} value={value}>
              {priorityLabels[value]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {projectsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement des projets…</p>
      ) : projectsQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {projectsQuery.error.message}
        </p>
      ) : projects?.data.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun projet trouvé.
        </p>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projet</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Priorité</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Manager</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects?.data.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {project.name}
                      </Link>
                      {project.team && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {project.team.name}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={projectStatusColors[project.status]}
                      >
                        {projectStatusLabels[project.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={priorityColors[project.priority]}
                      >
                        {priorityLabels[project.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(project.dueDate)}</TableCell>
                    <TableCell>
                      {project.manager ? displayName(project.manager) : "Non assigné"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <footer className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {projects?.total ?? 0} projet(s) · Page {page} sur{" "}
              {Math.max(1, Math.ceil((projects?.total ?? 0) / 10))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                disabled={!projects || page * projects.limit >= projects.total}
                onClick={() => setPage((current) => current + 1)}
              >
                Suivant
              </Button>
            </div>
          </footer>
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
            <DialogDescription>
              Renseignez les informations principales du projet.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Nom</Label>
              <Input id="project-name" {...register("name")} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <textarea
                id="project-description"
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register("description")}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-status">Statut</Label>
                <select
                  id="project-status"
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  {...register("status")}
                >
                  {projectStatuses.map((value) => (
                    <option key={value} value={value}>
                      {projectStatusLabels[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-priority">Priorité</Label>
                <select
                  id="project-priority"
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  {...register("priority")}
                >
                  {priorities.map((value) => (
                    <option key={value} value={value}>
                      {priorityLabels[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-start">Date de début</Label>
                <Input id="project-start" type="date" {...register("startDate")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-due">Échéance</Label>
                <Input id="project-due" type="date" {...register("dueDate")} />
                {errors.dueDate && (
                  <p className="text-sm text-destructive">
                    {errors.dueDate.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-manager">Manager</Label>
              <select
                id="project-manager"
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                {...register("managerId")}
              >
                <option value="">Par défaut</option>
                {usersQuery.data
                  ?.filter(
                    (person) =>
                      person.role === "MANAGER" ||
                      person.role === "COMPANY_ADMIN",
                  )
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {displayName(person)}
                    </option>
                  ))}
              </select>
              {usersQuery.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {usersQuery.error.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-team">Équipe</Label>
              <Select
                value={selectedTeamId || null}
                onValueChange={(value) =>
                  setValue("teamId", typeof value === "string" ? value : "", {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="project-team" className="w-full">
                  <SelectValue placeholder="Aucune équipe" />
                </SelectTrigger>
                <SelectContent>
                  {teamsQuery.data?.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {teamsQuery.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {teamsQuery.error.message}
                </p>
              )}
              {selectedTeamId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setValue("teamId", "", { shouldValidate: true })
                  }
                >
                  Retirer l’équipe
                </Button>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                {...register("addTeamMembers")}
              />
              Ajouter explicitement les membres actifs de l’équipe
            </label>
            {errors.teamId && (
              <p className="text-sm text-destructive">{errors.teamId.message}</p>
            )}
            {addTeamMembers && teamsQuery.isPending && (
              <p className="text-sm text-muted-foreground">
                Chargement des équipes…
              </p>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting || createMutation.isPending}
              >
                {createMutation.isPending ? "Création…" : "Créer le projet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
