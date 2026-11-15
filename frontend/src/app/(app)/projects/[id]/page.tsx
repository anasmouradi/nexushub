"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserPlus, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  priorityColors,
  priorityLabels,
  projectStatuses,
  projectStatusColors,
  projectStatusLabels,
  type ProjectStatus,
} from "@/lib/enums";
import { formatDate } from "@/lib/format";
import {
  addProjectMember,
  getProject,
  removeProjectMember,
  updateProject,
} from "@/lib/projects";
import { getCompanyUsers } from "@/lib/teams";

function displayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
  });
  const canManageProject =
    user?.role === "COMPANY_ADMIN" ||
    (user?.role === "MANAGER" &&
      projectQuery.data?.manager?.id === user.id);
  const usersQuery = useQuery({
    queryKey: ["company-users"],
    queryFn: getCompanyUsers,
    enabled: canManageProject,
  });

  const refreshProjectData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
    ]);
  };

  const statusMutation = useMutation({
    mutationFn: (status: ProjectStatus) =>
      updateProject(projectId, { status }),
    onSuccess: refreshProjectData,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Modification impossible");
    },
  });
  const addMutation = useMutation({
    mutationFn: () => addProjectMember(projectId, memberId),
    onSuccess: async () => {
      await refreshProjectData();
      setMemberId("");
      toast.success("Membre ajouté au projet");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    },
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => removeProjectMember(projectId, id),
    onSuccess: refreshProjectData,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Retrait impossible");
    },
  });

  if (projectQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Chargement du projet…</p>;
  }
  if (projectQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {projectQuery.error.message}
      </p>
    );
  }

  const project = projectQuery.data;
  const availableUsers = (usersQuery.data ?? []).filter(
    (person) => !project.members.some((member) => member.user.id === person.id),
  );

  return (
    <section className="space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour aux projets
      </Link>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-2xl">{project.name}</CardTitle>
              <CardDescription>
                {project.description || "Aucune description"}
              </CardDescription>
            </div>
            {canManageProject ? (
              <Label className="grid gap-1 text-sm">
                Statut
                <select
                  aria-label="Statut du projet"
                  value={project.status}
                  disabled={statusMutation.isPending}
                  onChange={(event) => {
                    const status = event.target.value;
                    if (projectStatuses.some((item) => item === status)) {
                      statusMutation.mutate(status as ProjectStatus);
                    }
                  }}
                  className="h-9 rounded-lg border border-input bg-background px-2"
                >
                  {projectStatuses.map((status) => (
                    <option key={status} value={status}>
                      {projectStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </Label>
            ) : (
              <Badge
                variant="outline"
                className={projectStatusColors[project.status]}
              >
                {projectStatusLabels[project.status]}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <p>
            <span className="text-muted-foreground">Priorité : </span>
            <Badge
              variant="outline"
              className={priorityColors[project.priority]}
            >
              {priorityLabels[project.priority]}
            </Badge>
          </p>
          <p>
            <span className="text-muted-foreground">Manager : </span>
            {project.manager ? displayName(project.manager) : "Non assigné"}
          </p>
          <p>
            <span className="text-muted-foreground">Équipe : </span>
            {project.team?.name ?? "Aucune"}
          </p>
          <p>
            <span className="text-muted-foreground">Début : </span>
            {formatDate(project.startDate)}
          </p>
          <p>
            <span className="text-muted-foreground">Échéance : </span>
            {formatDate(project.dueDate)}
          </p>
          <p>
            <span className="text-muted-foreground">Créé par : </span>
            {displayName(project.createdBy)}
          </p>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Membres</h2>
            <p className="text-sm text-muted-foreground">
              {project.members.length} membre(s) actif(s)
            </p>
          </div>
        </header>

        {canManageProject && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (memberId) addMutation.mutate();
            }}
          >
            <div className="min-w-64 space-y-2">
              <Label htmlFor="project-member">Ajouter un membre</Label>
              <Select
                value={memberId || null}
                onValueChange={(value) =>
                  setMemberId(typeof value === "string" ? value : "")
                }
                disabled={usersQuery.isPending || availableUsers.length === 0}
              >
                <SelectTrigger id="project-member" className="w-full">
                  <SelectValue
                    placeholder={
                      usersQuery.isPending
                        ? "Chargement des utilisateurs…"
                        : availableUsers.length
                          ? "Sélectionner un utilisateur"
                          : "Aucun utilisateur disponible"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {displayName(person)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {usersQuery.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {usersQuery.error.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={!memberId || addMutation.isPending}
            >
              <UserPlus />
              Ajouter
            </Button>
          </form>
        )}

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Ajouté le</TableHead>
                {canManageProject && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {project.members.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManageProject ? 4 : 3}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Aucun membre actif.
                  </TableCell>
                </TableRow>
              ) : (
                project.members.map(({ user: member, addedAt }) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium">{displayName(member)}</div>
                      <div className="text-xs text-muted-foreground">
                        {member.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{member.role}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(addedAt)}</TableCell>
                    {canManageProject && (
                      <TableCell className="text-right">
                        {project.manager?.id !== member.id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Retirer ${displayName(member)} du projet`}
                            disabled={removeMutation.isPending}
                            onClick={() => removeMutation.mutate(member.id)}
                          >
                            <UserRoundX />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Tâches</CardTitle>
          <CardDescription>
            La gestion des tâches sera disponible au prochain sprint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aucune tâche pour le moment.
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
