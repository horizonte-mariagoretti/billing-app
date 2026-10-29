import SalesActionPage from './SalesActionPage';
import { SALES_ACTIONS } from '../utils/lasagnaFinance';

// Baseballturnier — base page only for now (search, action date, year switcher).
const Baseball = () => <SalesActionPage action={SALES_ACTIONS.find((a) => a.key === 'baseball')} />;

export default Baseball;
