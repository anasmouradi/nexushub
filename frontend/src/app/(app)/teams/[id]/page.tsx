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
  addTeamMember,
  getCompanyUsers,
  getTeam,
  removeTeamMember,
} from "@/lib/teams";

function displayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const teamId = params.id;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => getTeam(teamId),
  });
  const canManageTeam =
    user?.role === "COMPANY_ADMIN" ||
    (user?.role === "MANAGER" && teamQuery.data?.manager?.id === user.id);
  const usersQuery = useQuery({
    queryKey: ["company-users"],
    queryFn: getCompanyUsers,
    enabled: canManageTeam,
  });

  const refreshTeamData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["team", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
    ]);
  };

  const addMutation = useMutation({
    mutationFn: () => addTeamMember(teamId, memberId),
    onSuccess: async () => {
      await refreshTeamData();
      setMemberId("");
      toast.success("Membre ajouté à l’équipe");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeTeamMember(teamId, id),
    onSuccess: refreshTeamData,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Retrait impossible");
    },
  });

  if (teamQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Chargement de l’équipe…</p>;
  }
  if (teamQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {teamQuery.error.message}
      </p>
    );
  }

  const team = teamQuery.data;
  const availableUsers = (usersQuery.data ?? []).filter(
    (person) => !team.members.some((member) => member.user.id === person.id),
  );

  return (
    <section className="space-y-6">
      <Link
        href="/teams"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour aux équipes
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{team.name}</CardTitle>
          <CardDescription>
            {team.description || "Aucune description"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Manager : </span>
            {team.manager ? displayName(team.manager) : "Non assigné"}
          </p>
          <p>
            <span className="text-muted-foreground">Membres actifs : </span>
            {team.members.length}
          </p>
        </CardContent>
      </Card>

      {canManageTeam && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (memberId) addMutation.mutate();
          }}
        >
          <div className="min-w-64 space-y-2">
            <Label htmlFor="team-member">Ajouter un membre</Label>
            <Select
              value={memberId || null}
              onValueChange={(value) =>
                setMemberId(typeof value === "string" ? value : "")
              }
              disabled={usersQuery.isPending || availableUsers.length === 0}
            >
              <SelectTrigger id="team-member" className="w-full">
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
              <TableHead>Rejoint le</TableHead>
              {canManageTeam && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.members.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canManageTeam ? 4 : 3}
                  className="h-24 text-center text-muted-foreground"
                >
                  Aucun membre actif.
                </TableCell>
              </TableRow>
            ) : (
              team.members.map(({ user: member, joinedAt }) => (
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
                  <TableCell>
                    {new Date(joinedAt).toLocaleDateString("fr-FR")}
                  </TableCell>
                  {canManageTeam && (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Retirer ${displayName(member)} de l’équipe`}
                        disabled={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(member.id)}
                      >
                        <UserRoundX />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
