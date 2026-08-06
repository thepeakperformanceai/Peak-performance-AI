import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import MemberRoster from "./components/MemberRoster";
import SquadComparison from "./components/SquadComparison";
import MemberDetail from "./components/MemberDetail";
import { apiService } from "./services/api";

export default function App() {
  const [rosterMembers, setRosterMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState("ahmed-raza");
  const [selectedMemberDetail, setSelectedMemberDetail] = useState(null);
  
  const [squadData, setSquadData] = useState(null);
  const [sportFilter, setSportFilter] = useState("All");
  const [sexFilter, setSexFilter] = useState("All");

  const [loadingRoster, setLoadingRoster] = useState(true);
  const [loadingSquad, setLoadingSquad] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // Initial load for Roster Members
  useEffect(() => {
    async function loadRoster() {
      setLoadingRoster(true);
      try {
        const data = await apiService.getMembers();
        setRosterMembers(data);
      } catch (err) {
        console.error("Error fetching roster members:", err);
      } finally {
        setLoadingRoster(false);
      }
    }
    loadRoster();
  }, []);

  // Fetch Squad Comparison data whenever sportFilter or sexFilter changes
  useEffect(() => {
    async function loadSquad() {
      setLoadingSquad(true);
      try {
        const data = await apiService.getSquadComparison(sportFilter, sexFilter);
        setSquadData(data);
      } catch (err) {
        console.error("Error fetching squad comparison:", err);
      } finally {
        setLoadingSquad(false);
      }
    }
    loadSquad();
  }, [sportFilter, sexFilter]);

  // Fetch Member Detail whenever selectedMemberId changes
  useEffect(() => {
    async function loadMemberDetail() {
      setLoadingDetail(true);
      try {
        const data = await apiService.getMemberDetail(selectedMemberId);
        setSelectedMemberDetail(data);
      } catch (err) {
        console.error("Error fetching member detail:", err);
      } finally {
        setLoadingDetail(false);
      }
    }
    loadMemberDetail();
  }, [selectedMemberId]);

  return (
    <div className="min-vh-100 py-4 py-md-5" style={{ backgroundColor: "#0b0f17" }}>
      <div className="container-xl px-3 px-md-4">
        {/* Top Header */}
        <Header />

        {/* Section 1: Member Roster Table */}
        <MemberRoster
          members={rosterMembers}
          selectedMemberId={selectedMemberId}
          onSelectMember={(id) => setSelectedMemberId(id)}
          loading={loadingRoster}
        />

        {/* Section 2: Squad Comparison & Filters */}
        <SquadComparison
          squadData={squadData}
          sportFilter={sportFilter}
          sexFilter={sexFilter}
          onSportFilterChange={setSportFilter}
          onSexFilterChange={setSexFilter}
          loading={loadingSquad}
        />

        {/* Section 3: Member Detail View */}
        <MemberDetail
          member={selectedMemberDetail}
          loading={loadingDetail}
        />
      </div>
    </div>
  );
}
