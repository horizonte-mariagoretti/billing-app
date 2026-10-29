import SalesActionPage from './SalesActionPage';
import { SALES_ACTIONS } from '../utils/lasagnaFinance';

// Glühweinbude — base page only for now (search, action date, year switcher).
const Gluehwein = () => <SalesActionPage action={SALES_ACTIONS.find((a) => a.key === 'gluehwein')} />;

export default Gluehwein;
