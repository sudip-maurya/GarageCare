import { useNavigate, useLocation } from 'react-router-dom';

export function useSmartBack(fallback) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.state?.from) {
      navigate(location.state.from);
    } else if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };
}
