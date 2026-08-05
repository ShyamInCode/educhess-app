import React from "react";
import AdminEvents from "./AdminEvents";

/**
 * Tournaments tab.
 *
 * This used to be a create-and-delete form: there was no UPDATE policy on
 * `tournaments`, so "editing" meant deleting the row and typing it again,
 * which cascade-deleted every registration attached to it. Phase 5 added the
 * policy; the shared AdminEvents surface does a real UPDATE.
 */
export default function AdminTournaments() {
  return <AdminEvents kind="tournament" />;
}
