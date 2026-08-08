import { UsersIcon, PageTitle } from "../lib/ui.jsx";
import { Section, TeamPanel } from "./Settings.jsx";

export default function EquipePage({ session, team, reloadTeam }) {
  return (
    <div style={{ padding: "28px 32px 60px", maxWidth: "620px" }}>
      <PageTitle icon={UsersIcon} color="#2a3ed6" style={{ marginBottom: "20px" }}>Équipe</PageTitle>

      <Section title="Membres" last>
        <TeamPanel session={session} team={team} reloadTeam={reloadTeam} />
      </Section>
    </div>
  );
}
