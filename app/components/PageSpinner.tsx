import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";

export function PageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="page-spinner" role="status" aria-label={t("app.loading")}>
      <Loading withOverlay={false} small description={t("app.loading")} />
    </div>
  );
}
