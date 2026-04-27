import { DensityToggle, FilterChip, Search, TimeframeSelector } from "@/components/primitives";

export default function ControlsRow() {
  return (
    <div className="controls-row">
      <TimeframeSelector value="90d" />
      <div className="controls-filters">
        <FilterChip active>Category</FilterChip>
        <FilterChip>N ≥ 20</FilterChip>
        <FilterChip>Tier S/A</FilterChip>
      </div>
      <Search placeholder="Search creator or asset" aria-label="Search creator or asset" />
      <DensityToggle value="comfortable" />
    </div>
  );
}
