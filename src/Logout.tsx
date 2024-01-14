import axios from "axios";
import { useCookies } from "react-cookie";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setData } from "./redux/data";

export const Logout: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [, setCookie] = useCookies(["userinfo"]);
  axios
    .post("/.netlify/functions/logout")
    .then((res) => {
      console.log(res.data);
      setCookie("userinfo", "{}", { path: "/" });
      dispatch(setData({}));
      navigate("/login");
    })
    .catch((e) => {
      console.log(e);
      alert(e.response.data);
    });

  return <></>;
};
