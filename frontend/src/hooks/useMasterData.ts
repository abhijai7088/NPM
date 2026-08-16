import { useQuery } from '@tanstack/react-query';
import { axiosInstance } from '../api/axiosInstance';

const fetchMinistries = async () => (await axiosInstance.get('/master/ministries')).data.data;
const fetchDepartments = async (ministryId?: string) => {
  const url = ministryId ? `/master/departments?ministryId=${ministryId}` : '/master/departments';
  return (await axiosInstance.get(url)).data.data;
};

export const useMinistries = () => useQuery({ 
  queryKey: ['ministries'], 
  queryFn: fetchMinistries, 
  staleTime: 900_000 
});

export const useDepartments = (ministryId?: string) => useQuery({ 
  queryKey: ['departments', ministryId], 
  queryFn: () => fetchDepartments(ministryId), 
  enabled: !!ministryId 
});
